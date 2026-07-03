import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { ensureVoiceTurnWav } from "./test/ui-smoke/fixtures/voice-fixture.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const uiSmokeLiveStack = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "playwright-ui-live-stack.ts",
);
const uiSmokeApiPort = Number(
  process.env.MILADY_UI_SMOKE_API_PORT ||
    process.env.ELIZA_UI_SMOKE_API_PORT ||
    "31337",
);
const uiSmokePort = Number(
  process.env.MILADY_UI_SMOKE_PORT || process.env.ELIZA_UI_SMOKE_PORT || "2138",
);
const reuseExistingServer = process.env.MILADY_UI_SMOKE_REUSE_SERVER === "1";

// Generated speech+silence WAV fed to Chromium's fake mic so the voice e2e
// drives the REAL VAD end-of-turn detector. See test/ui-smoke/voice-chat.spec.ts.
const voiceTurnWav = ensureVoiceTurnWav();

// Keep the app's API port env aligned with the live stack when the suite runs
// on non-default ports.
if (!process.env.MILADY_API_PORT) {
  process.env.MILADY_API_PORT = String(uiSmokeApiPort);
}
process.env.ELIZA_UI_SMOKE_API_PORT =
  process.env.ELIZA_UI_SMOKE_API_PORT || String(uiSmokeApiPort);
process.env.ELIZA_UI_SMOKE_PORT =
  process.env.ELIZA_UI_SMOKE_PORT || String(uiSmokePort);

export default defineConfig({
  testDir: "./test/ui-smoke",
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${uiSmokePort}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // The voice spec needs Chromium media flags (see voice-chromium); keep it
      // out of the default project so it only runs with the fake mic wired up.
      testIgnore: /voice-chat\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /(?:backgrounds|mobile-routes)\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      // Bidirectional voice loop on /chat. Chromium feeds the fake audio file
      // into getUserMedia so the overlay's real capture + VAD run unchanged;
      // only the on-device ASR/TTS models are stubbed server-side.
      name: "voice-chromium",
      testMatch: /voice-chat\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-audio-capture=${voiceTurnWav}`,
            // Let the overlay's capture + TTS AudioContext run without a click.
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `node ${JSON.stringify(path.join(repoRoot, "eliza", "packages", "app-core", "scripts", "run-node-tsx.mjs"))} ${JSON.stringify(uiSmokeLiveStack)}`,
    cwd: repoRoot,
    port: uiSmokePort,
    reuseExistingServer,
    timeout: 240_000,
  },
});
