import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");
const uiSmokeApiStub = path.join(
  repoRoot,
  "scripts/playwright-ui-smoke-api-stub.mjs",
);
const uiSmokeApiPort = Number(process.env.MILADY_UI_SMOKE_API_PORT || "31337");
const uiSmokePort = Number(process.env.MILADY_UI_SMOKE_PORT || "2138");

export default defineConfig({
  testDir: "./test/ui-smoke",
  timeout: 120_000,
  expect: {
    timeout: 10_000,
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
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `node ${JSON.stringify(uiSmokeApiStub)}`,
      cwd: repoRoot,
      port: uiSmokeApiPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `bun run build:web && bun run preview -- --host 127.0.0.1 --port ${uiSmokePort}`,
      cwd: appDir,
      port: uiSmokePort,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
