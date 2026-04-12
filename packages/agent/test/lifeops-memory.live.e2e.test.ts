import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  ChannelType,
  createMessageMemory,
  type Memory,
  logger,
  type Plugin,
  type UUID,
} from "@elizaos/core";
import dotenv from "dotenv";
import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import { saveEnv, sleep, withTimeout } from "../../../test/helpers/test-utils";
import { LifeOpsService } from "../src/lifeops/service";
import {
  buildCharacterFromConfig,
  configureLocalEmbeddingPlugin,
} from "../src/runtime/eliza";
import { createElizaPlugin } from "../src/runtime/eliza-plugin";
import {
  extractPlugin,
  type PluginModuleShape,
} from "../src/test-support/test-helpers";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });
dotenv.config({ path: path.resolve(packageRoot, "..", "..", ".env") });

const LIVE_TESTS_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";
const LIVE_CHAT_TESTS_ENABLED = process.env.MILADY_LIVE_CHAT_TEST === "1";
const LIVE_MEMORY_TESTS_ENABLED = process.env.MILADY_LIVE_MEMORY_TEST === "1";
const LIVE_PROVIDER_OVERRIDE = process.env.MILADY_LIVE_PROVIDER?.trim().toLowerCase();
const LIVE_CLOUD_ENV_PREFIXES = ["ELIZAOS_CLOUD_", "ELIZA_CLOUD_"] as const;
const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_SMALL_MODEL",
  "OPENAI_LARGE_MODEL",
  "GROQ_API_KEY",
  "GROQ_SMALL_MODEL",
  "GROQ_LARGE_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_SMALL_MODEL",
  "OPENROUTER_LARGE_MODEL",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_SMALL_MODEL",
  "GOOGLE_LARGE_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_SMALL_MODEL",
  "ANTHROPIC_LARGE_MODEL",
] as const;

const LIVE_PROVIDER_CANDIDATES = [
  {
    name: "openai",
    plugin: "@elizaos/plugin-openai",
    keys: ["OPENAI_API_KEY"],
  },
  {
    name: "openrouter",
    plugin: "@elizaos/plugin-openrouter",
    keys: ["OPENROUTER_API_KEY"],
  },
  {
    name: "google",
    plugin: "@elizaos/plugin-google-genai",
    keys: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
  },
  {
    name: "anthropic",
    plugin: "@elizaos/plugin-anthropic",
    keys: ["ANTHROPIC_API_KEY"],
  },
  {
    name: "groq",
    plugin: "@elizaos/plugin-groq",
    keys: ["GROQ_API_KEY"],
  },
] as const;

type SelectedLiveProvider = {
  name: string;
  env: Record<string, string>;
  plugin: string;
};

type SessionSummaryLike = {
  id: UUID;
  summary: string;
  messageCount: number;
  topics?: string[];
};

type LongTermMemoryLike = {
  id: UUID;
  content: string;
  category: string;
};

type MemoryServiceLike = {
  getCurrentSessionSummary(roomId: UUID): Promise<SessionSummaryLike | null>;
  getLongTermMemories(
    entityId: UUID,
    category?: string,
    limit?: number,
  ): Promise<LongTermMemoryLike[]>;
};

const LIVE_PROVIDER_CHEAP_MODELS = {
  anthropic: {
    smallKey: "ANTHROPIC_SMALL_MODEL",
    smallModel: "claude-haiku-4-5-20251001",
    largeKey: "ANTHROPIC_LARGE_MODEL",
    largeModel: "claude-haiku-4-5-20251001",
  },
  google: {
    smallKey: "GOOGLE_SMALL_MODEL",
    smallModel: "gemini-2.5-flash",
    largeKey: "GOOGLE_LARGE_MODEL",
    largeModel: "gemini-2.5-flash",
  },
  groq: {
    smallKey: "GROQ_SMALL_MODEL",
    smallModel: "llama-3.1-8b-instant",
    largeKey: "GROQ_LARGE_MODEL",
    largeModel: "qwen/qwen3-32b",
  },
  openai: {
    smallKey: "OPENAI_SMALL_MODEL",
    smallModel: "gpt-5.4-mini",
    largeKey: "OPENAI_LARGE_MODEL",
    largeModel: "gpt-5.4-mini",
  },
  openrouter: {
    smallKey: "OPENROUTER_SMALL_MODEL",
    smallModel: "google/gemini-2.5-flash",
    largeKey: "OPENROUTER_LARGE_MODEL",
    largeModel: "google/gemini-2.5-flash",
  },
} as const;

function resolveLiveProviderModelEnv(
  providerName: keyof typeof LIVE_PROVIDER_CHEAP_MODELS,
): Record<string, string> {
  const defaults = LIVE_PROVIDER_CHEAP_MODELS[providerName];
  const smallModel =
    process.env[defaults.smallKey]?.trim() || defaults.smallModel;
  const largeModel =
    process.env[defaults.largeKey]?.trim() ||
    process.env[defaults.smallKey]?.trim() ||
    defaults.largeModel;

  return {
    [defaults.smallKey]: smallModel,
    [defaults.largeKey]: largeModel,
    SMALL_MODEL: process.env.SMALL_MODEL?.trim() || smallModel,
    LARGE_MODEL: process.env.LARGE_MODEL?.trim() || largeModel,
  };
}

async function canImportPlugin(pluginName: string): Promise<boolean> {
  try {
    await import(pluginName);
    return true;
  } catch {
    return false;
  }
}

function detectOpenAiCompatibleBaseUrlProvider(
  baseUrl: string | undefined,
): "groq" | null {
  if (!baseUrl) {
    return null;
  }

  try {
    const hostname = new URL(baseUrl).hostname.trim().toLowerCase();
    if (hostname === "api.groq.com" || hostname.endsWith(".groq.com")) {
      return "groq";
    }
  } catch {
    return null;
  }

  return null;
}

function looksLikeGroqApiKey(value: string | undefined): boolean {
  return Boolean(value && /^gsk[-_]/i.test(value));
}

async function selectLiveProvider(): Promise<SelectedLiveProvider | null> {
  const openAiCompatProvider = detectOpenAiCompatibleBaseUrlProvider(
    process.env.OPENAI_BASE_URL?.trim(),
  );
  if (
    openAiCompatProvider === "groq" &&
    (!LIVE_PROVIDER_OVERRIDE ||
      LIVE_PROVIDER_OVERRIDE === "openai" ||
      LIVE_PROVIDER_OVERRIDE === "groq") &&
    (await canImportPlugin("@elizaos/plugin-groq"))
  ) {
    const groqApiKey =
      process.env.GROQ_API_KEY?.trim() ||
      (looksLikeGroqApiKey(process.env.OPENAI_API_KEY?.trim())
        ? process.env.OPENAI_API_KEY?.trim()
        : "");
    if (groqApiKey) {
      return {
        name: "groq",
        env: {
          GROQ_API_KEY: groqApiKey,
          ...resolveLiveProviderModelEnv("groq"),
        },
        plugin: "@elizaos/plugin-groq",
      };
    }
  }

  const candidates =
    LIVE_PROVIDER_OVERRIDE && LIVE_PROVIDER_OVERRIDE.length > 0
      ? LIVE_PROVIDER_CANDIDATES.filter(
          (candidate) => candidate.name === LIVE_PROVIDER_OVERRIDE,
        )
      : LIVE_PROVIDER_CANDIDATES;

  for (const candidate of candidates) {

    const env: Record<string, string> = {};
    for (const key of candidate.keys) {
      const value = process.env[key]?.trim();
      if (value) {
        env[key] = value;
      }
    }

    if (Object.keys(env).length === 0) {
      continue;
    }

    if (!(await canImportPlugin(candidate.plugin))) {
      continue;
    }

    Object.assign(
      env,
      resolveLiveProviderModelEnv(
        candidate.name as keyof typeof LIVE_PROVIDER_CHEAP_MODELS,
      ),
    );
    if (candidate.name === "openai" && process.env.OPENAI_BASE_URL?.trim()) {
      env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL.trim();
    }

    return {
      name: candidate.name,
      env,
      plugin: candidate.plugin,
    };
  }

  return null;
}

async function loadPlugin(name: string): Promise<Plugin | null> {
  try {
    return extractPlugin(
      (await import(name)) as PluginModuleShape,
    ) as Plugin | null;
  } catch (error) {
    logger.warn(
      `[lifeops-memory-live] failed to load ${name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function seedGroqModelDefaults(): void {
  if (!process.env.GROQ_SMALL_MODEL?.trim()) {
    process.env.GROQ_SMALL_MODEL = "llama-3.1-8b-instant";
  }
  if (!process.env.GROQ_LARGE_MODEL?.trim()) {
    process.env.GROQ_LARGE_MODEL = "qwen/qwen3-32b";
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildLifeActionPrompt(
  summary: string,
  action: string,
  intent: string,
  title?: string,
): string {
  const params = [
    `    <action>${escapeXml(action)}</action>`,
    `    <intent>${escapeXml(intent)}</intent>`,
    ...(title ? [`    <title>${escapeXml(title)}</title>`] : []),
  ].join("\n");

  return [
    summary,
    "Reply with exactly this assistant message and no extra text:",
    "Assistant:",
    "<actions>",
    "  <action>REPLY</action>",
    "  <action>LIFE</action>",
    "</actions>",
    "<params>",
    "  <LIFE>",
    params,
    "  </LIFE>",
    "</params>",
  ].join("\n");
}

async function handleMessageAndCollectText(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
  timeoutMs = 120_000,
): Promise<string> {
  let responseText = "";
  const result = await withTimeout(
    Promise.resolve(
      runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: { text?: string }) => {
          if (content.text) {
            responseText += content.text;
          }
          return [];
        },
      ),
    ),
    timeoutMs,
    "handleMessage",
  );

  return responseText || String(result?.responseContent?.text ?? "");
}

async function sendUserTurn(args: {
  runtime: AgentRuntime;
  entityId: UUID;
  roomId: UUID;
  source: string;
  text: string;
  timeoutMs?: number;
}): Promise<string> {
  const message = createMessageMemory({
    id: crypto.randomUUID() as UUID,
    entityId: args.entityId,
    roomId: args.roomId,
    metadata: {
      type: "user_message",
      entityName: "shaw",
    },
    content: {
      text: args.text,
      source: args.source,
      channelType: ChannelType.DM,
    },
  });

  const responseText = await handleMessageAndCollectText(
    args.runtime,
    message,
    args.timeoutMs,
  );
  return responseText;
}

async function waitForValue<T>(
  label: string,
  getValue: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 60_000,
  intervalMs = 1_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await getValue();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(lastValue)}`);
}

async function ensureDmRoom(args: {
  runtime: AgentRuntime;
  entityId: UUID;
  roomId: UUID;
  worldId: UUID;
  source: string;
  channelId: string;
  userName: string;
}): Promise<void> {
  await args.runtime.ensureWorldExists({
    id: args.worldId,
    name: `${args.source}-world`,
    agentId: args.runtime.agentId,
  } as Parameters<typeof args.runtime.ensureWorldExists>[0]);

  await args.runtime.ensureConnection({
    entityId: args.entityId,
    roomId: args.roomId,
    worldId: args.worldId,
    userName: args.userName,
    name: args.userName,
    source: args.source,
    channelId: args.channelId,
    type: ChannelType.DM,
  });

  await args.runtime.ensureParticipantInRoom(args.runtime.agentId, args.roomId);
  await args.runtime.ensureParticipantInRoom(args.entityId, args.roomId);
}

function findDefinitionByTitle(
  definitions: Awaited<ReturnType<LifeOpsService["listDefinitions"]>>,
  title: string,
) {
  return (
    definitions.find(
      (entry) => normalizeText(entry.definition.title) === normalizeText(title),
    ) ?? null
  );
}

const selectedLiveProvider = await selectLiveProvider();
const MEMORY_SUITE_PROVIDER_NAMES = new Set([
  "openai",
  "openrouter",
  "google",
  "anthropic",
  "groq",
]);
const MEMORY_SUITE_PROVIDER_SUPPORTED =
  selectedLiveProvider !== null &&
  MEMORY_SUITE_PROVIDER_NAMES.has(selectedLiveProvider.name);
const LIVE_SUITE_ENABLED =
  LIVE_TESTS_ENABLED &&
  LIVE_CHAT_TESTS_ENABLED &&
  LIVE_MEMORY_TESTS_ENABLED &&
  selectedLiveProvider !== null &&
  MEMORY_SUITE_PROVIDER_SUPPORTED;

if (!LIVE_SUITE_ENABLED) {
  const warnings = [
    !LIVE_TESTS_ENABLED ? "set MILADY_LIVE_TEST=1 or ELIZA_LIVE_TEST=1" : null,
    !LIVE_CHAT_TESTS_ENABLED ? "set MILADY_LIVE_CHAT_TEST=1" : null,
    !LIVE_MEMORY_TESTS_ENABLED ? "set MILADY_LIVE_MEMORY_TEST=1" : null,
    !selectedLiveProvider
      ? "provide a live provider key for OpenAI, Groq, OpenRouter, Google, or Anthropic"
      : null,
    selectedLiveProvider && !MEMORY_SUITE_PROVIDER_SUPPORTED
      ? `selected provider "${selectedLiveProvider.name}" does not support the reflection/fact-extraction live suite; use OpenAI, OpenRouter, or Google`
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  console.info(
    `[lifeops-memory-live] suite skipped until setup is complete: ${warnings.join(" | ")}`,
  );
}

describeIf(LIVE_SUITE_ENABLED)(
  "Live: LifeOps multi-turn memory and cross-channel behavior",
  () => {
    let runtime: AgentRuntime;
    let lifeOpsService: LifeOpsService;
    let memoryService: MemoryServiceLike;
    let envBackup: { restore: () => void };
    let cloudEnvBackup: Record<string, string> = {};

    const ownerId = crypto.randomUUID() as UUID;
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-lifeops-live-workspace-"),
    );
    const pgliteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-lifeops-live-pglite-"),
    );
    const envKeys = [
      ...PROVIDER_ENV_KEYS,
      "PGLITE_DATA_DIR",
      "LOCAL_EMBEDDING_DIMENSIONS",
      "EMBEDDING_DIMENSION",
      "ELIZA_DISABLE_LOCAL_EMBEDDINGS",
      "MILADY_DISABLE_LOCAL_EMBEDDINGS",
    ];

    beforeAll(async () => {
      envBackup = saveEnv(...envKeys);
      process.env.PGLITE_DATA_DIR = pgliteDir;
      process.env.LOG_LEVEL = process.env.ELIZA_E2E_LOG_LEVEL ?? "error";
      if (!process.env.LOCAL_EMBEDDING_DIMENSIONS?.trim()) {
        process.env.LOCAL_EMBEDDING_DIMENSIONS = "384";
      }
      if (!process.env.EMBEDDING_DIMENSION?.trim()) {
        process.env.EMBEDDING_DIMENSION = "384";
      }
      delete process.env.ELIZA_DISABLE_LOCAL_EMBEDDINGS;
      delete process.env.MILADY_DISABLE_LOCAL_EMBEDDINGS;
      cloudEnvBackup = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key, value]) =>
            typeof value === "string" &&
            LIVE_CLOUD_ENV_PREFIXES.some((prefix) => key.startsWith(prefix)),
        ),
      );
      for (const key of Object.keys(process.env)) {
        if (LIVE_CLOUD_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          delete process.env[key];
        }
      }

      for (const key of PROVIDER_ENV_KEYS) {
        delete process.env[key];
      }
      for (const [key, value] of Object.entries(selectedLiveProvider?.env ?? {})) {
        if (value.trim().length > 0) {
          process.env[key] = value;
        }
      }
      if (selectedLiveProvider?.name === "groq") {
        seedGroqModelDefaults();
      }

      const character = buildCharacterFromConfig({});
      const providerSecrets: Record<string, string> = {};
      for (const [key, value] of Object.entries(selectedLiveProvider?.env ?? {})) {
        if (value.trim().length > 0) {
          providerSecrets[key] = value;
        }
      }
      if (selectedLiveProvider?.name === "groq") {
        if (process.env.GROQ_SMALL_MODEL?.trim()) {
          providerSecrets.GROQ_SMALL_MODEL = process.env.GROQ_SMALL_MODEL;
        }
        if (process.env.GROQ_LARGE_MODEL?.trim()) {
          providerSecrets.GROQ_LARGE_MODEL = process.env.GROQ_LARGE_MODEL;
        }
      }
      character.settings = {
        ...(character.settings ?? {}),
        ELIZA_ADMIN_ENTITY_ID: ownerId,
        MEMORY_SUMMARIZATION_THRESHOLD: 4,
        MEMORY_SUMMARIZATION_INTERVAL: 1,
        MEMORY_RETAIN_RECENT: 2,
        MEMORY_MAX_NEW_MESSAGES: 12,
        MEMORY_EXTRACTION_THRESHOLD: 4,
        MEMORY_EXTRACTION_INTERVAL: 1,
      };
      character.secrets = {
        ...providerSecrets,
      };

      const sqlPlugin = await loadPlugin("@elizaos/plugin-sql");
      const localEmbeddingPlugin = await loadPlugin(
        "@elizaos/plugin-local-embedding",
      );
      const providerPlugin = selectedLiveProvider
        ? await loadPlugin(selectedLiveProvider.plugin)
        : null;

      if (!sqlPlugin || !localEmbeddingPlugin || !providerPlugin) {
        throw new Error("Required live plugins were not available.");
      }

      runtime = new AgentRuntime({
        character,
        plugins: [
          providerPlugin,
          createElizaPlugin({
            agentId: "main",
            workspaceDir,
          }),
        ],
        conversationLength: 12,
        enableAutonomy: false,
        logLevel: process.env.ELIZA_E2E_LOG_LEVEL ?? "error",
      });

      await runtime.registerPlugin(sqlPlugin);
      if (runtime.adapter && !(await runtime.adapter.isReady())) {
        await runtime.adapter.init();
      }
      configureLocalEmbeddingPlugin(localEmbeddingPlugin);
      await runtime.registerPlugin(localEmbeddingPlugin);

      await runtime.initialize();

      lifeOpsService = new LifeOpsService(runtime, {
        ownerEntityId: ownerId,
      });
      memoryService = (await runtime.getServiceLoadPromise(
        "memory",
      )) as unknown as MemoryServiceLike;
    }, 180_000);

    afterAll(async () => {
      if (runtime) {
        try {
          await withTimeout(runtime.stop(), 90_000, "runtime.stop()");
        } catch (error) {
          logger.warn(
            `[lifeops-memory-live] runtime.stop failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      envBackup?.restore();
      for (const key of Object.keys(process.env)) {
        if (LIVE_CLOUD_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          delete process.env[key];
        }
      }
      for (const [key, value] of Object.entries(cloudEnvBackup)) {
        process.env[key] = value;
      }
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(pgliteDir, { recursive: true, force: true });
    }, 120_000);

    it("keeps advanced memory enabled by default in the live Milady runtime", async () => {
      expect(runtime.character.advancedMemory).toBe(true);
      expect(memoryService).toBeTruthy();
      expect(
        runtime.providers.some((provider) => provider.name === "SUMMARIZED_CONTEXT"),
      ).toBe(true);
      expect(
        runtime.providers.some((provider) => provider.name === "LONG_TERM_MEMORY"),
      ).toBe(true);
      expect(
        runtime.evaluators.some((evaluator) => evaluator.name === "MEMORY_SUMMARIZATION"),
      ).toBe(true);
      expect(
        runtime.evaluators.some(
          (evaluator) => evaluator.name === "LONG_TERM_MEMORY_EXTRACTION",
        ),
      ).toBe(true);
      expect(
        runtime.evaluators.some((evaluator) => evaluator.name === "REFLECTION"),
      ).toBe(true);
    });

    it(
      "starts with smalltalk, previews brush-teeth creation, then saves it only after confirmation",
      async () => {
        const roomId = crypto.randomUUID() as UUID;
        const worldId = crypto.randomUUID() as UUID;
        await ensureDmRoom({
          runtime,
          entityId: ownerId,
          roomId,
          worldId,
          source: "telegram",
          channelId: `telegram-${roomId}`,
          userName: "shaw",
        });

        const turn1 = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId,
          source: "telegram",
          text: "hey, mornings have been a little chaotic lately.",
        });
        expect(turn1.trim().length).toBeGreaterThan(0);

        const turn2 = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId,
          source: "telegram",
          text: "the main thing i keep forgetting is brushing my teeth before i start working.",
        });
        expect(turn2.trim().length).toBeGreaterThan(0);

        const beforePreviewDefinitions = await lifeOpsService.listDefinitions();
        expect(findDefinitionByTitle(beforePreviewDefinitions, "Brush teeth")).toBeNull();

        const createPrompt = buildLifeActionPrompt(
          "Continue the same conversation. The user has already explained that mornings are chaotic and they keep forgetting to brush their teeth.",
          "create",
          "Actually create a routine named Brush teeth that happens every morning and every night. Do not just give advice.",
          "Brush teeth",
        );
        const previewResponse = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId,
          source: "telegram",
          text: createPrompt,
        });
        expect(previewResponse.trim().length).toBeGreaterThan(0);
        expect(
          findDefinitionByTitle(await lifeOpsService.listDefinitions(), "Brush teeth"),
        ).toBeNull();

        const confirmResponse = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId,
          source: "telegram",
          text: "Yes, save that brushing routine.",
        });
        expect(confirmResponse).toContain("Saved");

        const brushTeeth = await waitForValue(
          "brush-teeth definition",
          async () => findDefinitionByTitle(await lifeOpsService.listDefinitions(), "Brush teeth"),
          (entry) => entry !== null,
        );
        expect(brushTeeth?.definition.cadence).toMatchObject({
          kind: "times_per_day",
          slots: expect.arrayContaining([
            expect.objectContaining({ minuteOfDay: 8 * 60 }),
            expect.objectContaining({ minuteOfDay: 21 * 60 }),
          ]),
        });
        expect(brushTeeth?.reminderPlan?.id ?? null).not.toBeNull();

        const preferencePrompt = buildLifeActionPrompt(
          "Continue the same conversation.",
          "reminder_preference",
          "Actually remind me less about Brush teeth. Do not just explain the setting.",
          "Brush teeth",
        );
        const preferenceResponse = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId,
          source: "telegram",
          text: preferencePrompt,
        });
        expect(preferenceResponse).toContain(
          'Reminder intensity for "Brush teeth" is now minimal.',
        );

        const preference = await lifeOpsService.getReminderPreference(
          brushTeeth?.definition.id,
        );
        expect(preference.effective.intensity).toBe("minimal");
      },
      240_000,
    );

    it(
      "stores summaries, reflection facts, and long-term memories, then recalls them from another channel",
      async () => {
        const sourceRoomId = crypto.randomUUID() as UUID;
        const sourceWorldId = crypto.randomUUID() as UUID;
        const targetRoomId = crypto.randomUUID() as UUID;
        const targetWorldId = crypto.randomUUID() as UUID;

        await ensureDmRoom({
          runtime,
          entityId: ownerId,
          roomId: sourceRoomId,
          worldId: sourceWorldId,
          source: "telegram",
          channelId: `telegram-${sourceRoomId}`,
          userName: "shaw",
        });
        await ensureDmRoom({
          runtime,
          entityId: ownerId,
          roomId: targetRoomId,
          worldId: targetWorldId,
          source: "discord",
          channelId: `discord-${targetRoomId}`,
          userName: "shaw",
        });

        const setupTurns = [
          "hey, quick check-in before we get into anything serious.",
          "small thing to remember: i always prefer text reminders and i do not want phone-call reminders.",
          "to be explicit, that is a stable preference for me: text reminders only, never phone calls.",
          "also, i wear Invisalign during the day and i usually forget to put it back in after lunch.",
          "that invisalign thing is a real recurring pattern for me, especially on weekdays after lunch.",
          "gentle nudges work better for me than aggressive ones.",
          "can you keep those preferences in mind for later?",
        ];

        for (const text of setupTurns) {
          const response = await sendUserTurn({
            runtime,
            entityId: ownerId,
            roomId: sourceRoomId,
            source: "telegram",
            text,
          });
          expect(response.trim().length).toBeGreaterThan(0);
        }

        const sessionSummary = await memoryService.getCurrentSessionSummary(
          sourceRoomId,
        );
        if (sessionSummary) {
          expect(sessionSummary.summary.trim().length).toBeGreaterThan(0);
        }

        const reflectionFacts = await waitForValue(
          "reflection facts",
          async () =>
            (await runtime.getMemories({
              tableName: "facts",
              roomId: sourceRoomId,
              count: 20,
              unique: false,
            })) as Memory[],
          (facts) =>
            facts.length > 0 &&
            facts.some((fact) =>
              /text|phone|invisalign/i.test(
                String(fact.content?.text ?? ""),
              ),
            ),
          120_000,
        );
        expect(reflectionFacts.length).toBeGreaterThan(0);

        const relationships = await waitForValue(
          "reflection relationships",
          async () =>
            await runtime.getRelationships({
              entityIds: [ownerId],
            }),
          (entries) => Array.isArray(entries) && entries.length > 0,
        );
        expect(relationships.length).toBeGreaterThan(0);

        const longTermMemories = await waitForValue(
          "long-term memories",
          async () => memoryService.getLongTermMemories(ownerId, undefined, 10),
          (memories) =>
            memories.some((memory) => /text|phone/i.test(memory.content)) &&
            memories.some((memory) => /invisalign/i.test(memory.content)),
          90_000,
        );
        expect(longTermMemories.length).toBeGreaterThan(0);

        const crossChannelResponse = await sendUserTurn({
          runtime,
          entityId: ownerId,
          roomId: targetRoomId,
          source: "discord",
          text: "we switched channels. what reminder channel do i prefer, and what do i usually forget after lunch?",
        });
        const normalizedResponse = normalizeText(crossChannelResponse);
        expect(normalizedResponse).toContain("text");
        expect(normalizedResponse).toContain("invisalign");
      },
      240_000,
    );
  },
);
