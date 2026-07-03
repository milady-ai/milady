import { expect, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

// Mirrors the voice fixtures in playwright-ui-smoke-api-stub.mjs: the ASR stub
// transcribes any captured audio to VOICE_TRANSCRIPT, and the chat stub replies
// to that turn with VOICE_REPLY.
const VOICE_TRANSCRIPT = "this is the voice smoke transcript";
const VOICE_REPLY = "Got it, this is the spoken reply.";

const POST = (re: RegExp) => (req: { method(): string; url(): string }) =>
  req.method() === "POST" && re.test(req.url());

test.beforeEach(async ({ page }) => {
  // Always-on listening: the overlay opens the mic on ready, and Chromium's
  // fake audio file (a speech burst + trailing silence) drives the REAL VAD
  // end-of-turn detector — no scripted click needed.
  await seedAppStorage(page, {
    "eliza:voice:continuous-chat-mode": "always-on",
  });
  await installDefaultAppRoutes(page);
});

test("voice chat is bidirectional on /chat: listen → end-of-turn → transcribe → reply → speak", async ({
  page,
}) => {
  // The two server round-trips that prove each direction of the loop. Armed
  // before navigation so a fast turn cannot race ahead of the listeners.
  const asrPosted = page.waitForRequest(POST(/\/api\/asr\/local-inference$/), {
    timeout: 90_000,
  });
  const ttsPosted = page.waitForRequest(POST(/\/api\/tts\/local-inference$/), {
    timeout: 90_000,
  });

  await openAppPath(page, "/chat");

  // The ambient overlay IS the /chat surface.
  await expect(page.getByTestId("continuous-chat-overlay")).toBeVisible();

  // INPUT: always-on capture → VAD detects end-of-turn → POST the captured WAV
  // to local-inference ASR. Awaiting this proves listening + end-of-turn +
  // transcription all fired against real browser-captured audio.
  await asrPosted;

  // The transcribed turn is sent (as a VOICE_DM) and rendered as the user's
  // message in the overlay thread.
  await expect(page.getByText(VOICE_TRANSCRIPT, { exact: false })).toBeVisible({
    timeout: 30_000,
  });

  // OUTPUT (the half that was missing): the assistant reply renders AND is
  // spoken — the POST to local-inference TTS is the bidirectional signal.
  await expect(page.getByText(VOICE_REPLY, { exact: false })).toBeVisible({
    timeout: 30_000,
  });
  await ttsPosted;
});
