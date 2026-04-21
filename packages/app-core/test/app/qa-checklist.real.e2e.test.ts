import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";

const envPath = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  ".env",
);
try {
  const { config } = await import("dotenv");
  config({ path: envPath });
} catch {
  // Keys may already be present in process.env.
}

const DEFAULT_UI_URL = stripTrailingSlash(
  process.env.MILADY_LIVE_UI_URL ??
    process.env.MILADY_UI_URL ??
    "http://localhost:2138",
);
const API_URL = stripTrailingSlash(
  process.env.MILADY_LIVE_API_URL ??
    process.env.MILADY_API_URL ??
    "http://127.0.0.1:31337",
);
const API_TOKEN =
  process.env.MILADY_API_TOKEN?.trim() ??
  process.env.ELIZA_API_TOKEN?.trim() ??
  "";
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() ?? "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim() ?? "";
const CHROME_PATH =
  process.env.MILADY_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LIVE_TESTS_ENABLED = process.env.MILADY_LIVE_TEST === "1";
const CAN_RUN =
  LIVE_TESTS_ENABLED &&
  GROQ_API_KEY.length > 0 &&
  ELEVENLABS_API_KEY.length > 0;
const PROFILE_FILTER = new Set(
  (process.env.MILADY_LIVE_PROFILE ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const EXPECTED_CHEN_GREETING = "you good?";
const EXPECTED_SARAH_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const KNOWLEDGE_CODEWORD = "VELVET-MOON-4821";
const QA_ARTIFACT_DIR = path.join(os.tmpdir(), "milady-live-qa");

type QaFetchRecord = {
  url: string;
  method: string;
  status?: number;
  error?: string;
};

type QaEmoteEventRecord = {
  type: string;
  emoteId: string | null;
  path: string | null;
  duration: number | null;
  loop: boolean | null;
  at: number;
};

type QaPlayEmoteRecord = {
  role: string | null;
  vrmPath: string | null;
  path: string | null;
  duration: number | null;
  loop: boolean | null;
  at: number;
};

type QaTeleportRecord = {
  type: string;
  at: number;
};

type QaVrmRegistryEntry = {
  role: string | null;
  vrmPath: string | null;
  worldUrl: string | null;
  avatarLoaded: boolean;
  avatarReady: boolean;
  cameraProfile: string | null;
};

type QaVoiceStats = {
  audioStarts: number;
  speechCalls: number;
  ttsFetches: QaFetchRecord[];
};

type CharacterRosterState = {
  labels: string[];
  selectedLabel: string | null;
  selectedTestId: string | null;
};

type CharacterRosterEntryState = {
  label: string;
  testId: string | null;
  selected: boolean;
  previewSrc: string | null;
};

type Profile = {
  id: "desktop" | "mobile";
  label: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
  };
  userAgent?: string;
};

const PROFILES: Profile[] = [
  {
    id: "desktop",
    label: "Desktop",
    viewport: {
      width: 1440,
      height: 980,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    id: "mobile",
    label: "Mobile",
    viewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  },
];
const ACTIVE_PROFILES =
  PROFILE_FILTER.size > 0
    ? PROFILES.filter((profile) => PROFILE_FILTER.has(profile.id))
    : PROFILES;

function logQaStep(profile: Profile, step: string) {
  console.log(`[live-qa][${profile.id}] ${step}`);
}

let browser: Browser | null = null;
let UI_URL = DEFAULT_UI_URL;

describeIf(CAN_RUN)("Live QA checklist", () => {
  beforeAll(async () => {
    if (!CAN_RUN) return;
    await fs.mkdir(QA_ARTIFACT_DIR, { recursive: true });
    UI_URL = await resolveLiveUiUrl();
    await ensureHttpOk(`${UI_URL}/`);
    await ensureHttpOk(`${API_URL}/api/status`);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      protocolTimeout: 300_000,
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--use-angle=swiftshader",
      ],
    });
  }, 120_000);

  afterAll(async () => {
    if (!CAN_RUN) return;
    await browser?.close();
  }, 30_000);

  for (const profile of ACTIVE_PROFILES) {
    it(`${profile.label}: completes the real QA checklist`, async () => {
      const activeBrowser = ensureBrowser(browser);
      const context = await activeBrowser.createBrowserContext();
      const origin = new URL(UI_URL).origin;
      await context.overridePermissions(origin, ["camera", "microphone"]);

      const page = await context.newPage();
      await page.setViewport(profile.viewport);
      if (profile.userAgent) {
        await page.setUserAgent(profile.userAgent);
      }
      page.setDefaultTimeout(45_000);
      page.setDefaultNavigationTimeout(60_000);

      const pageErrors: string[] = [];
      const sameOriginFailures: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });
      page.on("requestfailed", (request) => {
        const url = request.url();
        if (
          url.startsWith(UI_URL) ||
          url.startsWith(API_URL) ||
          url.startsWith(new URL(UI_URL).origin)
        ) {
          sameOriginFailures.push(
            `${request.method()} ${url} (${request.failure()?.errorText ?? "requestfailed"})`,
          );
        }
      });
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      await installQaInstrumentation(page);
      logQaStep(profile, "reset agent");
      await resetAgentViaApi();

      const knowledgeFile = await writeKnowledgeFile(profile.id);
      const knowledgeUploadName = path.basename(knowledgeFile);
      const knowledgeDocumentNames = [
        knowledgeUploadName,
        path.parse(knowledgeUploadName).name,
      ];
      try {
        logQaStep(profile, "open onboarding");
        await navigate(page, `${UI_URL}/?test_force_vrm=1`);

        logQaStep(profile, "complete local groq onboarding");
        await waitForText(page, "Get Started");
        await clickByText(page, "Get Started");
        await clickByText(page, "Local");
        await clickByText(page, "Groq");
        await typeInto(page, 'input[type="password"]', GROQ_API_KEY);
        await clickByText(page, "Confirm");
        await clickByText(page, "Continue");
        await clickByText(page, "Enter");

        logQaStep(profile, "verify default chen character select");
        await waitFor(
          async () => {
            return page.url().endsWith("/character-select") ? true : null;
          },
          180_000,
          1000,
        );

        const rosterState = await waitForCharacterRoster(page, 120_000);
        expect(rosterState.labels[0]).toBe("Chen");
        expect(rosterState.selectedLabel).toBe("Chen");
        expect(await onboardingComplete()).toBe(true);
        const chenPreviewSrc = await selectedCharacterPreviewSrc(page);
        const chenAvatarSlug = assetSlug(chenPreviewSrc);
        if (!chenAvatarSlug) {
          throw new Error(
            "Selected Chen preview did not resolve to an avatar slug.",
          );
        }
        const onboardingAvatar = await waitForWorldStageAvatar(
          page,
          chenAvatarSlug,
          120_000,
        );
        expect(onboardingAvatar.avatarLoaded).toBe(true);
        expect(onboardingAvatar.avatarReady).toBe(true);

        const voiceConfig = await waitFor(async () => {
          const config = await apiJson<{
            messages?: {
              tts?: {
                provider?: string;
                elevenlabs?: { voiceId?: string };
              };
            };
          }>("/api/config");
          const tts = config?.messages?.tts;
          return tts?.provider === "elevenlabs" ? tts : null;
        }, 60_000);
        expect(voiceConfig.elevenlabs?.voiceId).toBe(EXPECTED_SARAH_VOICE_ID);

        logQaStep(profile, "enter companion mode");
        await clickSelector(page, '[data-testid="ui-shell-toggle-companion"]');
        await page.waitForFunction(
          () => window.location.pathname.endsWith("/companion"),
          { timeout: 30_000 },
        );
        const companionAvatar = await waitForWorldStageAvatar(
          page,
          chenAvatarSlug,
          120_000,
        );
        expect(assetSlug(companionAvatar.vrmPath)).toBe(chenAvatarSlug);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
        });
        await page.waitForSelector('[data-testid="chat-composer-textarea"]');
        await page.mouse.click(24, 24);

        logQaStep(profile, "create new chat");
        const conversationsBefore = await listConversations();
        const greetingVoiceSignals = await qaVoiceStats(page);
        await clickSelector(page, 'button[aria-label="New Chat"]');

        const activeConversation = await waitFor(async () => {
          const conversations = await listConversations();
          return conversations.length === conversationsBefore.length + 1
            ? conversations[0]
            : null;
        }, 30_000);

        const greetingMessage = await waitFor(async () => {
          const messages = await listMessages(activeConversation.id);
          return (
            messages.find((message) => message.role === "assistant") ?? null
          );
        }, 30_000);

        expect(normalizeText(greetingMessage.text)).toContain(
          normalizeText(EXPECTED_CHEN_GREETING),
        );
        logQaStep(profile, "wait for greeting voice playback");
        await waitForVoicePlayback(page, greetingVoiceSignals, 45_000);
        logQaStep(profile, "verify greeting text is visible");
        await waitForText(page, greetingMessage.text);

        const responseVoiceSignals = await qaVoiceStats(page);
        logQaStep(profile, "send user message");
        await typeComposerAndSend(
          page,
          "reply with exactly these two words: hello there",
        );

        const replyMessage = await waitFor(async () => {
          const messages = await listMessages(activeConversation.id);
          const assistants = messages.filter(
            (message) => message.role === "assistant",
          );
          if (assistants.length < 2) return null;
          const latest = assistants[assistants.length - 1];
          return latest.text !== greetingMessage.text ? latest : null;
        }, 90_000);

        expect(normalizeText(replyMessage.text)).toContain("hello there");
        logQaStep(profile, "wait for assistant reply voice playback");
        await waitForVoicePlayback(page, responseVoiceSignals, 45_000);

        logQaStep(profile, "enable trajectories and upload knowledge");
        await apiJson("/api/trajectories/config", {
          method: "PUT",
          body: JSON.stringify({ enabled: true }),
        });

        await clickSelector(page, '[data-testid="ui-shell-toggle-desktop"]');
        await navigate(page, `${UI_URL}/knowledge`);
        await waitForText(page, "Choose Files");

        const uploadInput = await page.waitForSelector('input[type="file"]');
        expect(uploadInput).toBeTruthy();
        if (!uploadInput) {
          throw new Error("Knowledge upload input was not found.");
        }
        await uploadInput.uploadFile(knowledgeFile);

        const uploadedDocument = await waitFor(
          async () => {
            const docs = await listKnowledgeDocuments();
            return (
              docs.find(
                (document) =>
                  knowledgeDocumentNames.includes(document.filename),
              ) ?? null
            );
          },
          120_000,
          2000,
        );

        expect(knowledgeDocumentNames).toContain(uploadedDocument.filename);
        await waitFor(async () => {
          const text = await page.evaluate(() => document.body.innerText ?? "");
          return knowledgeDocumentNames.some((name) => text.includes(name))
            ? true
            : null;
        }, 120_000, 1000);

        await waitFor(
          async () => {
            const results = await knowledgeSearch("qa codeword");
            return results.some((result) =>
              String(result.text ?? "")
                .toUpperCase()
                .includes(KNOWLEDGE_CODEWORD),
            );
          },
          120_000,
          2000,
        );

        await navigate(page, `${UI_URL}/chat`);
        await page.waitForSelector('[data-testid="chat-composer-textarea"]');
        await typeComposerAndSend(
          page,
          "what is the qa codeword from the uploaded file? answer with only the codeword",
        );

        const knowledgeReply = await waitFor(async () => {
          const messages = await listMessages(activeConversation.id);
          return (
            [...messages].reverse().find(
              (message) =>
                message.role === "assistant" &&
                String(message.text ?? "")
                  .toUpperCase()
                  .includes(KNOWLEDGE_CODEWORD),
            ) ?? null
          );
        }, 90_000);
        expect(knowledgeReply.text.toUpperCase()).toContain(KNOWLEDGE_CODEWORD);

        logQaStep(profile, "verify trajectory contents");
        const matchingTrajectory = await waitFor(
          async () => {
            const list = await apiJson<{ trajectories: Array<{ id: string }> }>(
              "/api/trajectories?limit=20",
            );
            for (const trajectory of list.trajectories ?? []) {
              const detail = await apiJson<{
                llmCalls?: Array<{
                  userPrompt?: string;
                  response?: string;
                }>;
              }>(`/api/trajectories/${encodeURIComponent(trajectory.id)}`);
              const match = (detail.llmCalls ?? []).find((call) => {
                const prompt = String(call.userPrompt ?? "").toLowerCase();
                return prompt.includes("qa codeword from the uploaded file");
              });
              if (match) {
                return { detail, match };
              }
            }
            return null;
          },
          90_000,
          2000,
        );

        expect(String(matchingTrajectory.match.userPrompt)).toContain(
          "qa codeword from the uploaded file",
        );
        expect(
          String(matchingTrajectory.match.response).toUpperCase(),
        ).toContain(KNOWLEDGE_CODEWORD);

        await navigate(page, `${UI_URL}/trajectories`);
        await page.waitForSelector('[data-testid="trajectories-view"]');
        await typeInto(
          page,
          '[data-testid="trajectories-view"] input[type="text"]',
          "qa codeword from the uploaded file",
        );
        await page.waitForSelector(
          '[data-testid="trajectories-view"] tbody tr',
        );
        await clickSelector(page, '[data-testid="trajectories-view"] tbody tr');
        await waitForText(page, "qa codeword from the uploaded file", 30_000);
        await waitForText(page, KNOWLEDGE_CODEWORD, 30_000);

        logQaStep(profile, "smoke tabs");
        await smokeTabs(page, profile);
        logQaStep(profile, "verify character switch dance emote and voice");
        await qaCharacterSwitchAndDance(page, profile);

        logQaStep(profile, "reset back to onboarding");
        await navigate(page, `${UI_URL}/settings`);
        await waitForText(page, "Reset Agent");
        await clickByText(page, "Reset Everything");
        await waitForText(page, "Get Started", 180_000);

        expect(await onboardingComplete()).toBe(false);
        expect((await listConversations()).length).toBe(0);
        expect((await listKnowledgeDocumentsAfterReset()).length).toBe(0);
        await saveScreenshot(page, profile, "reset-to-onboarding");

        expect(pageErrors).toEqual([]);
        expect(sameOriginFailures).toEqual([]);
      } catch (error) {
        await saveFailureArtifacts(page, profile, error);
        throw error;
      } finally {
        await fs.rm(knowledgeFile, { force: true });
        await context.close();
      }
    }, 600_000);

    it(`${profile.label}: validates avatar state, voice, and character switching`, async () => {
      const activeBrowser = ensureBrowser(browser);
      const context = await activeBrowser.createBrowserContext();
      const origin = new URL(UI_URL).origin;
      await context.overridePermissions(origin, ["camera", "microphone"]);

      const page = await context.newPage();
      await page.setViewport(profile.viewport);
      if (profile.userAgent) {
        await page.setUserAgent(profile.userAgent);
      }
      page.setDefaultTimeout(45_000);
      page.setDefaultNavigationTimeout(60_000);

      const pageErrors: string[] = [];
      const sameOriginFailures: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });
      page.on("requestfailed", (request) => {
        const url = request.url();
        if (
          url.startsWith(UI_URL) ||
          url.startsWith(API_URL) ||
          url.startsWith(new URL(UI_URL).origin)
        ) {
          sameOriginFailures.push(
            `${request.method()} ${url} (${request.failure()?.errorText ?? "requestfailed"})`,
          );
        }
      });
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      await installQaInstrumentation(page);
      logQaStep(profile, "avatar-voice QA reset agent");
      await resetAgentViaApi();

      try {
        logQaStep(profile, "avatar-voice QA open onboarding");
        await navigate(page, `${UI_URL}/?test_force_vrm=1`);

        logQaStep(profile, "avatar-voice QA complete local groq onboarding");
        await waitForText(page, "Get Started");
        await clickByText(page, "Get Started");
        await clickByText(page, "Local");
        await clickByText(page, "Groq");
        await typeInto(page, 'input[type="password"]', GROQ_API_KEY);
        await clickByText(page, "Confirm");
        await clickByText(page, "Continue");
        await clickByText(page, "Enter");

        const rosterState = await waitForCharacterRoster(page, 120_000);
        expect(rosterState.labels[0]).toBe("Chen");
        expect(rosterState.selectedLabel).toBe("Chen");

        const chenPreviewSrc = await selectedCharacterPreviewSrc(page);
        const chenAvatarSlug = assetSlug(chenPreviewSrc);
        if (!chenAvatarSlug) {
          throw new Error(
            "Selected Chen preview did not resolve to an avatar slug.",
          );
        }

        logQaStep(profile, "avatar-voice QA verify onboarding avatar");
        const onboardingAvatar = await waitForWorldStageAvatar(
          page,
          chenAvatarSlug,
          120_000,
        );
        expect(onboardingAvatar.avatarLoaded).toBe(true);
        expect(onboardingAvatar.avatarReady).toBe(true);

        logQaStep(profile, "avatar-voice QA enter companion mode");
        await clickSelector(page, '[data-testid="ui-shell-toggle-companion"]');
        await page.waitForFunction(
          () => window.location.pathname.endsWith("/companion"),
          { timeout: 30_000 },
        );

        const companionAvatar = await waitForWorldStageAvatar(
          page,
          chenAvatarSlug,
          120_000,
        );
        expect(assetSlug(companionAvatar.vrmPath)).toBe(chenAvatarSlug);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("eliza:vrm-teleport-complete"));
        });
        await page.waitForSelector('[data-testid="chat-composer-textarea"]');
        await page.mouse.click(24, 24);

        logQaStep(profile, "avatar-voice QA create new chat");
        const conversationsBefore = await listConversations();
        const greetingVoiceSignals = await qaVoiceStats(page);
        await clickSelector(page, 'button[aria-label="New Chat"]');

        const activeConversation = await waitFor(async () => {
          const conversations = await listConversations();
          return conversations.length === conversationsBefore.length + 1
            ? conversations[0]
            : null;
        }, 30_000);

        const greetingMessage = await waitFor(async () => {
          const messages = await listMessages(activeConversation.id);
          return (
            messages.find((message) => message.role === "assistant") ?? null
          );
        }, 30_000);
        expect(normalizeText(greetingMessage.text)).toContain(
          normalizeText(EXPECTED_CHEN_GREETING),
        );
        await waitForVoicePlayback(page, greetingVoiceSignals, 45_000);
        await waitForText(page, greetingMessage.text);

        logQaStep(profile, "avatar-voice QA validate reply voice");
        const responseVoiceSignals = await qaVoiceStats(page);
        await typeComposerAndSend(
          page,
          "reply with exactly these two words: hello there",
        );
        const replyMessage = await waitFor(async () => {
          const messages = await listMessages(activeConversation.id);
          const assistants = messages.filter(
            (message) => message.role === "assistant",
          );
          if (assistants.length < 2) return null;
          const latest = assistants[assistants.length - 1];
          return latest.text !== greetingMessage.text ? latest : null;
        }, 90_000);
        expect(normalizeText(replyMessage.text)).toContain("hello there");
        await waitForVoicePlayback(page, responseVoiceSignals, 45_000);

        logQaStep(
          profile,
          "avatar-voice QA validate character switch dance and emotes",
        );
        await qaCharacterSwitchAndDance(page, profile);

        expect(pageErrors).toEqual([]);
        expect(sameOriginFailures).toEqual([]);
      } catch (error) {
        await saveFailureArtifacts(page, profile, error);
        throw error;
      } finally {
        await context.close();
      }
    }, 420_000);
  }
});

async function smokeTabs(page: Page, profile: Profile) {
  const tabChecks: Array<{
    path: string;
    name: string;
    waitForReady: () => Promise<void>;
  }> = [
    {
      path: "/chat",
      name: "chat",
      waitForReady: () =>
        page.waitForSelector('[data-testid="chat-messages-scroll"]'),
    },
    {
      path: "/stream",
      name: "stream",
      waitForReady: () => waitForText(page, "Go Live", 30_000),
    },
    {
      path: "/wallets",
      name: "wallets",
      waitForReady: () => waitForText(page, "Tokens", 30_000),
    },
    {
      path: "/connectors",
      name: "connectors",
      waitForReady: () =>
        page.waitForSelector('[data-testid="connectors-settings-sidebar"]'),
    },
    {
      path: "/settings",
      name: "settings",
      waitForReady: () => waitForText(page, "Reset Agent", 30_000),
    },
    {
      path: "/triggers",
      name: "triggers",
      waitForReady: () => waitForText(page, "Display Name", 30_000),
    },
    {
      path: "/plugins",
      name: "plugins",
      waitForReady: () =>
        page.waitForSelector('[data-testid="plugins-subgroup-sidebar"]'),
    },
    {
      path: "/skills",
      name: "skills",
      waitForReady: () => waitForText(page, "Create Skill", 30_000),
    },
    {
      path: "/runtime",
      name: "runtime",
      waitForReady: () => page.waitForSelector('[data-testid="runtime-view"]'),
    },
    {
      path: "/database",
      name: "database",
      waitForReady: () => waitForText(page, "Vectors", 30_000),
    },
    {
      path: "/desktop",
      name: "desktop",
      waitForReady: () => waitForText(page, "Refresh Diagnostics", 30_000),
    },
    {
      path: "/logs",
      name: "logs",
      waitForReady: () => waitForText(page, "Search logs", 30_000),
    },
  ];

  for (const tab of tabChecks) {
    await navigate(page, `${UI_URL}${tab.path}`);
    await tab.waitForReady();
    await saveScreenshot(page, profile, `tab-${tab.name}`);
  }
}

async function installQaInstrumentation(page: Page) {
  await page.evaluateOnNewDocument(() => {
    type QaRegistryEngine = {
      playEmote?: (...args: unknown[]) => unknown;
      __qaPlayEmoteWrapped?: boolean;
    };

    type QaRegistryEntry = {
      engine?: QaRegistryEngine;
      role?: string;
      vrmPath?: string;
    };

    const qaWindow = window as typeof window & {
      __qaAudioStarts?: Array<{ at: number }>;
      __qaEmoteEvents?: QaEmoteEventRecord[];
      __qaFetches?: QaFetchRecord[];
      __qaPlayEmoteCalls?: QaPlayEmoteRecord[];
      __qaSpeechCalls?: Array<{ text: string; at: number }>;
      __qaTeleportEvents?: QaTeleportRecord[];
    };

    qaWindow.__qaAudioStarts = [];
    qaWindow.__qaEmoteEvents = [];
    qaWindow.__qaFetches = [];
    qaWindow.__qaPlayEmoteCalls = [];
    qaWindow.__qaSpeechCalls = [];
    qaWindow.__qaTeleportEvents = [];

    const QA_EMOTE_EVENT_NAME = "eliza:app-emote";
    const QA_TELEPORT_EVENT_NAME = "eliza:vrm-teleport-complete";
    let vrmRegistryStore: QaRegistryEntry[] = [];

    const recordWindowEvent = (event: Event) => {
      if (event.type === QA_EMOTE_EVENT_NAME) {
        const detail =
          event instanceof CustomEvent && typeof event.detail === "object"
            ? (event.detail as Record<string, unknown> | null)
            : null;
        qaWindow.__qaEmoteEvents?.push({
          type: event.type,
          emoteId: typeof detail?.emoteId === "string" ? detail.emoteId : null,
          path: typeof detail?.path === "string" ? detail.path : null,
          duration:
            typeof detail?.duration === "number" &&
            Number.isFinite(detail.duration)
              ? detail.duration
              : null,
          loop: typeof detail?.loop === "boolean" ? detail.loop : null,
          at: Date.now(),
        });
      }
      if (event.type === QA_TELEPORT_EVENT_NAME) {
        qaWindow.__qaTeleportEvents?.push({
          type: event.type,
          at: Date.now(),
        });
      }
    };

    const originalDispatchEvent = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event: Event) => {
      recordWindowEvent(event);
      return originalDispatchEvent(event);
    };

    const patchRegistryEntry = (entry: QaRegistryEntry) => {
      const engine = entry.engine;
      if (!engine || typeof engine.playEmote !== "function") {
        return;
      }
      if (engine.__qaPlayEmoteWrapped === true) {
        return;
      }
      const originalPlayEmote = engine.playEmote.bind(engine);
      engine.playEmote = (...args: unknown[]) => {
        qaWindow.__qaPlayEmoteCalls?.push({
          role: typeof entry.role === "string" ? entry.role : null,
          vrmPath: typeof entry.vrmPath === "string" ? entry.vrmPath : null,
          path: typeof args[0] === "string" ? args[0] : null,
          duration:
            typeof args[1] === "number" && Number.isFinite(args[1])
              ? args[1]
              : null,
          loop: typeof args[2] === "boolean" ? args[2] : null,
          at: Date.now(),
        });
        return originalPlayEmote(...args);
      };
      engine.__qaPlayEmoteWrapped = true;
    };

    Object.defineProperty(window, "__ELIZA_VRM_ENGINES__", {
      configurable: true,
      get() {
        return vrmRegistryStore;
      },
      set(value) {
        vrmRegistryStore = Array.isArray(value) ? value : [];
        vrmRegistryStore.forEach((entry) => {
          patchRegistryEntry(entry);
        });
      },
    });

    const OriginalAudioContext =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (OriginalAudioContext) {
      const originalCreateBufferSource =
        OriginalAudioContext.prototype.createBufferSource;
      OriginalAudioContext.prototype.createBufferSource = function patched() {
        const source = originalCreateBufferSource.call(this);
        const originalStart = source.start.bind(source);
        source.start = (
          ...args: Parameters<AudioBufferSourceNode["start"]>
        ) => {
          qaWindow.__qaAudioStarts?.push({ at: Date.now() });
          return originalStart(...args);
        };
        return source;
      };
    }

    if (window.speechSynthesis?.speak) {
      const originalSpeak = window.speechSynthesis.speak.bind(
        window.speechSynthesis,
      );
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        qaWindow.__qaSpeechCalls?.push({
          text: utterance.text,
          at: Date.now(),
        });
        return originalSpeak(utterance);
      };
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1];
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      const method =
        init?.method ||
        (input instanceof Request ? input.method : undefined) ||
        "GET";

      try {
        const response = await originalFetch(...args);
        qaWindow.__qaFetches?.push({
          url: requestUrl,
          method: method.toUpperCase(),
          status: response.status,
        });
        return response;
      } catch (error) {
        qaWindow.__qaFetches?.push({
          url: requestUrl,
          method: method.toUpperCase(),
          error: String(error),
        });
        throw error;
      }
    };
  });
}

async function qaVoiceStats(page: Page): Promise<QaVoiceStats> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaAudioStarts?: Array<{ at: number }>;
      __qaSpeechCalls?: Array<{ text: string; at: number }>;
      __qaFetches?: QaFetchRecord[];
    };

    const ttsFetches = (qaWindow.__qaFetches ?? []).filter((record) => {
      const url = String(record.url ?? "");
      return (
        url.includes("/api/tts/") ||
        url.includes("/api/stream/voice/speak") ||
        url.includes("api.elevenlabs.io")
      );
    });

    return {
      audioStarts: qaWindow.__qaAudioStarts?.length ?? 0,
      speechCalls: qaWindow.__qaSpeechCalls?.length ?? 0,
      ttsFetches,
    };
  });
}

async function qaFetches(page: Page): Promise<QaFetchRecord[]> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaFetches?: QaFetchRecord[];
    };
    return qaWindow.__qaFetches ?? [];
  });
}

async function waitForVoicePlayback(
  page: Page,
  baseline: QaVoiceStats,
  timeout = 45_000,
): Promise<QaVoiceStats> {
  return waitFor(async () => {
    const stats = await qaVoiceStats(page);
    const newTtsFetches = stats.ttsFetches.slice(baseline.ttsFetches.length);
    const hasSuccessfulTts = newTtsFetches.some(
      (record) => record.status === 200,
    );
    const hasAudiblePlayback =
      stats.audioStarts > baseline.audioStarts ||
      stats.speechCalls > baseline.speechCalls;
    return hasSuccessfulTts && hasAudiblePlayback ? stats : null;
  }, timeout);
}

async function waitForText(page: Page, text: string, timeout = 45_000) {
  await waitFor(async () => {
    const bodyText = await page.evaluate(() => {
      const body = document.body;
      const visibleText = body?.innerText ?? "";
      const domText = body?.textContent ?? "";
      return `${visibleText}\n${domText}`;
    });
    return bodyText.toLowerCase().includes(text.toLowerCase()) ? true : null;
  }, timeout);
}

async function currentVrmRegistry(page: Page): Promise<QaVrmRegistryEntry[]> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __ELIZA_VRM_ENGINES__?: Array<{
        role?: string;
        vrmPath?: string;
        worldUrl?: string | null;
        getDebugInfo?: () => {
          avatar?: {
            loaded?: boolean;
            ready?: boolean;
          };
          cameraProfile?: string;
        };
      }>;
    };

    return (qaWindow.__ELIZA_VRM_ENGINES__ ?? []).map((entry) => {
      const debug =
        typeof entry.getDebugInfo === "function" ? entry.getDebugInfo() : null;
      return {
        role: typeof entry.role === "string" ? entry.role : null,
        vrmPath: typeof entry.vrmPath === "string" ? entry.vrmPath : null,
        worldUrl:
          typeof entry.worldUrl === "string" || entry.worldUrl === null
            ? entry.worldUrl
            : null,
        avatarLoaded: debug?.avatar?.loaded === true,
        avatarReady: debug?.avatar?.ready === true,
        cameraProfile:
          typeof debug?.cameraProfile === "string" ? debug.cameraProfile : null,
      };
    });
  });
}

async function waitForWorldStageAvatar(
  page: Page,
  expectedSlug?: string | null,
  timeout = 90_000,
): Promise<QaVrmRegistryEntry> {
  return waitFor(async () => {
    const entries = await currentVrmRegistry(page);
    const worldStage =
      entries.find((entry) => entry.role === "world-stage") ?? null;
    if (!worldStage) return null;
    if (!worldStage.avatarLoaded || !worldStage.avatarReady) return null;
    if (expectedSlug && assetSlug(worldStage.vrmPath) !== expectedSlug)
      return null;
    return worldStage;
  }, timeout);
}

async function qaEmoteEvents(page: Page): Promise<QaEmoteEventRecord[]> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaEmoteEvents?: QaEmoteEventRecord[];
    };
    return qaWindow.__qaEmoteEvents ?? [];
  });
}

async function qaPlayEmoteCalls(page: Page): Promise<QaPlayEmoteRecord[]> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaPlayEmoteCalls?: QaPlayEmoteRecord[];
    };
    return qaWindow.__qaPlayEmoteCalls ?? [];
  });
}

async function qaTeleportEvents(page: Page): Promise<QaTeleportRecord[]> {
  return page.evaluate(() => {
    const qaWindow = window as typeof window & {
      __qaTeleportEvents?: QaTeleportRecord[];
    };
    return qaWindow.__qaTeleportEvents ?? [];
  });
}

async function waitForCharacterRoster(
  page: Page,
  timeout = 90_000,
): Promise<CharacterRosterState> {
  await page.waitForSelector('[data-testid="character-roster-grid"]', {
    visible: true,
    timeout,
  });
  await page.waitForSelector('[data-testid="character-preset-chen"]', {
    visible: true,
    timeout,
  });
  await page.waitForSelector(
    '[data-testid="character-preset-chen"][aria-pressed="true"]',
    {
      visible: true,
      timeout,
    },
  );

  return page.$$eval('[data-testid^="character-preset-"]', (buttons) => {
    const labels = buttons
      .map((button) => (button.textContent ?? "").trim())
      .filter(Boolean);
    const selected = buttons.find(
      (button) => button.getAttribute("aria-pressed") === "true",
    );

    return {
      labels,
      selectedLabel: selected?.textContent?.trim() || null,
      selectedTestId: selected?.getAttribute("data-testid") ?? null,
    };
  });
}

async function characterRosterEntries(
  page: Page,
): Promise<CharacterRosterEntryState[]> {
  return page.$$eval('[data-testid^="character-preset-"]', (buttons) => {
    return buttons.map((button) => {
      const image = button.querySelector("img");
      return {
        label: (button.textContent ?? "").trim(),
        testId: button.getAttribute("data-testid"),
        selected: button.getAttribute("aria-pressed") === "true",
        previewSrc:
          image?.getAttribute("src") ?? image?.getAttribute("data-src") ?? null,
      };
    });
  });
}

async function selectedCharacterPreviewSrc(page: Page): Promise<string> {
  const previewSrc = await page.$eval(
    '[data-testid^="character-preset-"][aria-pressed="true"] img',
    (img) => img.getAttribute("src"),
  );
  if (!previewSrc) {
    throw new Error("Selected character preview src was empty.");
  }
  return previewSrc;
}

async function clickByText(page: Page, text: string) {
  await page.waitForFunction(
    (expected) => {
      const normalizedExpected = String(expected).toLowerCase();
      return Array.from(
        document.querySelectorAll<HTMLElement>("button,[role='button']"),
      ).some((element) => {
        const position = window.getComputedStyle(element).position;
        const visible =
          element.offsetParent !== null ||
          position === "fixed" ||
          position === "sticky";
        const label = (element.innerText ?? "").toLowerCase();
        return visible && label.includes(normalizedExpected);
      });
    },
    { timeout: 45_000 },
    text,
  );

  const clicked = await page.evaluate((expected) => {
    const normalizedExpected = String(expected).toLowerCase();
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("button,[role='button']"),
    );
    const target = elements.find((element) => {
      const position = window.getComputedStyle(element).position;
      const visible =
        element.offsetParent !== null ||
        position === "fixed" ||
        position === "sticky";
      const label = (element.innerText ?? "").toLowerCase();
      return visible && label.includes(normalizedExpected);
    });
    target?.click();
    return Boolean(target);
  }, text);
  expect(clicked).toBe(true);
}

async function clickSelector(page: Page, selector: string) {
  await page.waitForFunction(
    (expected) => {
      const element = document.querySelector(expected);
      if (!(element instanceof HTMLElement)) return false;
      return (
        element.offsetParent !== null ||
        window.getComputedStyle(element).position === "fixed"
      );
    },
    { timeout: 45_000 },
    selector,
  );
  const clicked = await page.evaluate((expected) => {
    const element = document.querySelector(expected);
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  }, selector);
  expect(clicked).toBe(true);
}

async function typeInto(page: Page, selector: string, value: string) {
  const input = await page.waitForSelector(selector, { visible: true });
  expect(input).toBeTruthy();
  if (!input) {
    throw new Error(`Input not found for selector: ${selector}`);
  }
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await input.type(value, { delay: 5 });
}

async function typeComposerAndSend(page: Page, value: string) {
  await typeInto(page, '[data-testid="chat-composer-textarea"]', value);
  await page.keyboard.press("Enter");
}

async function qaCharacterSwitchAndDance(page: Page, profile?: Profile) {
  if (profile) {
    logQaStep(profile, "character-switch QA open character view");
  }
  await navigate(page, `${UI_URL}/character`);
  const roster = await waitForCharacterRoster(page, 120_000);
  const entries = await characterRosterEntries(page);
  const currentEntry = entries.find((entry) => entry.selected);
  expect(currentEntry?.testId).toBe(roster.selectedTestId);

  const nextEntry = entries.find(
    (entry) => entry.testId && entry.testId !== roster.selectedTestId,
  );
  if (!nextEntry?.testId) {
    throw new Error(
      "No alternate character entry was available for switching.",
    );
  }
  if (!nextEntry.previewSrc) {
    throw new Error(
      `Character ${nextEntry.testId} is missing a preview image.`,
    );
  }
  const nextAvatarSlug = assetSlug(nextEntry?.previewSrc);
  if (!nextAvatarSlug) {
    throw new Error(
      `Character ${nextEntry.testId} preview did not resolve to an avatar slug.`,
    );
  }

  const teleportBaseline = (await qaTeleportEvents(page)).length;
  const greetingEmoteBaseline = (await qaEmoteEvents(page)).length;
  const greetingPlayBaseline = (await qaPlayEmoteCalls(page)).length;
  const greetingVoiceBaseline = await qaVoiceStats(page);

  if (profile) {
    logQaStep(profile, `character-switch QA select ${nextEntry.testId}`);
  }
  await clickSelector(page, `[data-testid="${nextEntry.testId}"]`);
  await page.waitForSelector(
    `[data-testid="${nextEntry.testId}"][aria-pressed="true"]`,
    {
      visible: true,
      timeout: 45_000,
    },
  );

  if (profile) {
    logQaStep(profile, "character-switch QA wait for swapped world avatar");
  }
  const switchedAvatar = await waitForWorldStageAvatar(
    page,
    nextAvatarSlug,
    120_000,
  );
  expect(assetSlug(switchedAvatar.vrmPath)).toBe(nextAvatarSlug);

  if (profile) {
    logQaStep(profile, "character-switch QA wait for teleport event");
  }
  const teleportEvents = await waitFor(async () => {
    const events = await qaTeleportEvents(page);
    return events.length > teleportBaseline ? events : null;
  }, 60_000);
  expect(teleportEvents.length).toBeGreaterThan(teleportBaseline);

  if (profile) {
    logQaStep(profile, "character-switch QA wait for greeting emote");
  }
  const greetingEmoteEvents = await waitFor(async () => {
    const events = await qaEmoteEvents(page);
    const latest = events.slice(greetingEmoteBaseline);
    return latest.some((event) => event.emoteId === "greeting") ? latest : null;
  }, 60_000);
  expect(
    greetingEmoteEvents.some((event) => event.emoteId === "greeting"),
  ).toBe(true);

  const greetingPlayEmotes = await waitFor(async () => {
    const calls = await qaPlayEmoteCalls(page);
    const latest = calls.slice(greetingPlayBaseline);
    return latest.some(
      (call) =>
        call.role === "world-stage" &&
        assetSlug(call.vrmPath) === nextAvatarSlug &&
        String(call.path ?? "").includes("greeting"),
    )
      ? latest
      : null;
  }, 60_000);
  expect(
    greetingPlayEmotes.some(
      (call) =>
        call.role === "world-stage" &&
        assetSlug(call.vrmPath) === nextAvatarSlug &&
        String(call.path ?? "").includes("greeting"),
    ),
  ).toBe(true);

  if (profile) {
    logQaStep(profile, "character-switch QA wait for switch greeting voice");
  }
  await waitForVoicePlayback(page, greetingVoiceBaseline, 60_000);

  const danceFetchBaseline = (await qaFetches(page)).length;
  const danceEmoteBaseline = (await qaEmoteEvents(page)).length;
  const dancePlayBaseline = (await qaPlayEmoteCalls(page)).length;

  if (profile) {
    logQaStep(profile, "character-switch QA open dance emote picker");
  }
  await page.evaluate(() => {
    document.dispatchEvent(new Event("eliza:emote-picker"));
  });
  await page.waitForSelector('button[title="Dance Happy"]', {
    visible: true,
    timeout: 30_000,
  });
  await clickSelector(page, 'button[title="Dance Happy"]');
  await page.waitForSelector(
    '[data-testid="global-emote-overlay"][data-emote-id="dance-happy"]',
    {
      visible: true,
      timeout: 45_000,
    },
  );

  if (profile) {
    logQaStep(profile, "character-switch QA wait for dance emote API");
  }
  const emoteFetches = await waitFor(async () => {
    const fetches = await qaFetches(page);
    const latest = fetches.slice(danceFetchBaseline);
    return latest.some(
      (record) =>
        record.method === "POST" &&
        String(record.url).includes("/api/emote") &&
        record.status === 200,
    )
      ? latest
      : null;
  }, 45_000);
  expect(
    emoteFetches.some(
      (record) =>
        record.method === "POST" &&
        String(record.url).includes("/api/emote") &&
        record.status === 200,
    ),
  ).toBe(true);

  if (profile) {
    logQaStep(profile, "character-switch QA wait for dance emote event");
  }
  const danceEvents = await waitFor(async () => {
    const events = await qaEmoteEvents(page);
    const latest = events.slice(danceEmoteBaseline);
    return latest.some((event) => event.emoteId === "dance-happy")
      ? latest
      : null;
  }, 45_000);
  expect(danceEvents.some((event) => event.emoteId === "dance-happy")).toBe(
    true,
  );

  if (profile) {
    logQaStep(profile, "character-switch QA wait for dance animation playback");
  }
  const dancePlayCalls = await waitFor(async () => {
    const calls = await qaPlayEmoteCalls(page);
    const latest = calls.slice(dancePlayBaseline);
    return latest.some(
      (call) =>
        call.role === "world-stage" &&
        assetSlug(call.vrmPath) === nextAvatarSlug &&
        String(call.path ?? "")
          .toLowerCase()
          .includes("dance"),
    )
      ? latest
      : null;
  }, 45_000);
  expect(
    dancePlayCalls.some(
      (call) =>
        call.role === "world-stage" &&
        assetSlug(call.vrmPath) === nextAvatarSlug &&
        String(call.path ?? "")
          .toLowerCase()
          .includes("dance"),
    ),
  ).toBe(true);
}

async function writeKnowledgeFile(profileId: string): Promise<string> {
  const filename = `milady-qa-knowledge-${profileId}.txt`;
  const fullPath = path.join(os.tmpdir(), filename);
  await fs.writeFile(
    fullPath,
    [
      "Milady QA knowledge fixture.",
      `The QA codeword is ${KNOWLEDGE_CODEWORD}.`,
      "If asked for the QA codeword, answer with only the codeword.",
    ].join("\n"),
    "utf8",
  );
  return fullPath;
}

async function onboardingComplete(): Promise<boolean> {
  const result = await apiJson<{ complete: boolean }>("/api/onboarding/status");
  return result.complete;
}

async function resetAgentViaApi() {
  await apiJson("/api/agent/reset", { method: "POST" });
  await waitFor(async () => !(await onboardingComplete()), 30_000);
  const conversations = await listConversations();
  const documents = await listKnowledgeDocumentsAfterReset();
  if (conversations.length > 0 || documents.length > 0) {
    throw new Error(
      `Reset API left persisted state behind (conversations=${conversations.length}, knowledge=${documents.length}). Hard runtime restart required before live QA.`,
    );
  }
}

async function listConversations(): Promise<Array<{ id: string }>> {
  const result = await apiJson<{ conversations: Array<{ id: string }> }>(
    "/api/conversations",
  );
  return result.conversations ?? [];
}

async function listMessages(
  conversationId: string,
): Promise<Array<{ role: string; text: string }>> {
  const result = await apiJson<{
    messages: Array<{ role: string; text: string }>;
  }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`);
  return result.messages ?? [];
}

async function listKnowledgeDocuments(): Promise<Array<{ filename: string }>> {
  const result = await apiJson<{ documents: Array<{ filename: string }> }>(
    "/api/knowledge/documents",
  );
  return result.documents ?? [];
}

async function listKnowledgeDocumentsAfterReset(): Promise<
  Array<{ filename: string }>
> {
  try {
    return await listKnowledgeDocuments();
  } catch (error) {
    if (
      !(await onboardingComplete()) ||
      (error instanceof Error && /^(404|500)\b/.test(error.message))
    ) {
      return [];
    }
    throw error;
  }
}

async function knowledgeSearch(
  query: string,
): Promise<Array<{ text: string }>> {
  const encoded = encodeURIComponent(query);
  const result = await apiJson<{ results: Array<{ text: string }> }>(
    `/api/knowledge/search?q=${encoded}&threshold=0.1&limit=5`,
  );
  return result.results ?? [];
}

async function apiJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const url = new URL(pathname, API_URL);
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (API_TOKEN) {
    headers.set("Authorization", `Bearer ${API_TOKEN}`);
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${url.pathname}`,
    );
  }
  return (await response.json()) as T;
}

async function ensureHttpOk(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Expected ${url} to be reachable, got ${response.status}`);
  }
}

async function isHttpOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveLiveUiUrl(): Promise<string> {
  if (await isHttpOk(`${DEFAULT_UI_URL}/`)) {
    return DEFAULT_UI_URL;
  }

  const candidates: string[] = [];

  try {
    const stack = await apiJson<{
      desktop?: {
        rendererUrl?: string | null;
        uiPort?: number | null;
      };
      desktopDevLog?: {
        filePath?: string | null;
      };
    }>("/api/dev/stack");

    if (stack.desktop?.rendererUrl) {
      candidates.push(stripTrailingSlash(stack.desktop.rendererUrl));
    }

    if (typeof stack.desktop?.uiPort === "number" && stack.desktop.uiPort > 0) {
      candidates.push(`http://127.0.0.1:${stack.desktop.uiPort}`);
      candidates.push(`http://localhost:${stack.desktop.uiPort}`);
    }

    const devLogPath = stack.desktopDevLog?.filePath?.trim();
    if (devLogPath) {
      const logContent = await fs.readFile(devLogPath, "utf8");
      const rendererMatches = logContent.match(
        /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g,
      );
      if (rendererMatches) {
        candidates.push(...rendererMatches.map(stripTrailingSlash));
      }
    }
  } catch {
    // Fall back to static guesses below.
  }

  candidates.push("http://127.0.0.1:5174", "http://localhost:5174");

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await isHttpOk(`${candidate}/`)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to resolve live UI URL. Tried: ${[DEFAULT_UI_URL, ...uniqueCandidates].join(", ")}`,
  );
}

async function navigate(page: Page, url: string) {
  const targetUrl = new URL(url);
  const currentUrl = page.url();

  if (currentUrl) {
    const current = new URL(currentUrl);
    if (current.origin === targetUrl.origin) {
      await page.evaluate((nextHref) => {
        const next = new URL(nextHref, window.location.href);
        const nextPath = `${next.pathname}${next.search}${next.hash}`;
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (currentPath === nextPath) return;
        window.history.pushState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, targetUrl.href);

      await waitFor(
        async () => {
          const href = await page.evaluate(() => window.location.href);
          return href === targetUrl.href ? true : null;
        },
        30_000,
        100,
      );

      await page.waitForFunction(() => document.readyState !== "loading", {
        timeout: 30_000,
      });
      return;
    }
  }

  await page.goto(targetUrl.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.readyState !== "loading", {
    timeout: 30_000,
  });
}

async function saveScreenshot(page: Page, profile: Profile, step: string) {
  const filename = path.join(QA_ARTIFACT_DIR, `${profile.id}-${step}.png`);
  try {
    await page.screenshot({ path: filename, fullPage: true });
  } catch (error) {
    const noteFile = path.join(QA_ARTIFACT_DIR, `${profile.id}-${step}.txt`);
    await fs.writeFile(
      noteFile,
      `Screenshot unavailable: ${error instanceof Error ? error.message : String(error)}\n`,
      "utf8",
    );
  }
}

async function saveFailureArtifacts(
  page: Page,
  profile: Profile,
  error: unknown,
) {
  await saveScreenshot(page, profile, "failure");
  const textFile = path.join(
    QA_ARTIFACT_DIR,
    `${profile.id}-failure-state.txt`,
  );

  let url = "unavailable";
  let title = "unavailable";
  let bodyText = "unavailable";
  let voiceStatsSummary = "unavailable";

  try {
    url = page.url();
  } catch {}

  try {
    title = await page.title();
  } catch {}

  try {
    bodyText = await page.evaluate(() =>
      document.body.innerText.slice(0, 10_000),
    );
  } catch (pageError) {
    bodyText = `Unavailable: ${pageError instanceof Error ? pageError.message : String(pageError)}`;
  }

  try {
    const voiceStats = await qaVoiceStats(page);
    voiceStatsSummary = JSON.stringify(voiceStats, null, 2);
  } catch (statsError) {
    voiceStatsSummary = `Unavailable: ${statsError instanceof Error ? statsError.message : String(statsError)}`;
  }

  await fs.writeFile(
    textFile,
    [
      `Error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      `URL: ${url}`,
      `Title: ${title}`,
      "",
      "Voice stats:",
      voiceStatsSummary,
      "",
      bodyText,
    ].join("\n"),
    "utf8",
  );
}

async function waitFor<T>(
  producer: () => Promise<T | null | false> | T | null | false,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const result = await producer();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out after ${timeoutMs}ms`);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function assetSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const pathname = value.startsWith("http") ? new URL(value).pathname : value;
    const filename = pathname.split("/").pop() ?? "";
    if (!filename) return null;
    return filename.replace(/\.vrm(\.gz)?$/i, "").replace(/\.png$/i, "");
  } catch {
    return null;
  }
}

function ensureBrowser(value: Browser | null): Browser {
  if (!value) {
    throw new Error("Browser was not started");
  }
  return value;
}
