import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { startMockApiServer, type MockApiServer } from "./mock-api";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const electronAppDir = path.join(repoRoot, "apps", "app", "electron");
const webDistIndex = path.join(repoRoot, "apps", "app", "dist", "index.html");
const electronEntryCandidates = [
  path.join(electronAppDir, "out", "src", "index"),
  path.join(electronAppDir, "build", "src", "index"),
];

async function ensureBuildArtifacts(): Promise<void> {
  try {
    await fs.access(webDistIndex);
  } catch {
    test.skip(true, `Web dist index not found: ${webDistIndex}`);
    return;
  }

  let hasElectronEntry = false;
  for (const candidate of electronEntryCandidates) {
    try {
      await fs.access(candidate);
      hasElectronEntry = true;
      break;
    } catch {
      // Try next candidate.
    }
  }
  if (!hasElectronEntry) {
    test.skip(true, `Electron build artifact not found. Tried:\n${electronEntryCandidates.join("\n")}`);
  }
}

async function clickOnboardingNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^next$/i }).click();
}

test("electron auth + onboarding permissions flow works end-to-end", async () => {
  await ensureBuildArtifacts();

  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-electron-e2e-auth-"));
  let api: MockApiServer | null = null;
  let app: ElectronApplication | null = null;

  try {
    api = await startMockApiServer({
      onboardingComplete: false,
      port: 0,
      auth: {
        token: "desktop-auth-token",
        pairingCode: "1234-5678",
        pairingEnabled: true,
      },
      permissions: {
        accessibility: { status: "denied", canRequest: true },
        "screen-recording": { status: "denied", canRequest: true },
        microphone: { status: "denied", canRequest: true },
      },
    });

    const electronRequire = createRequire(path.join(electronAppDir, "package.json"));
    const electronExecutable = electronRequire("electron") as string;

    const launchApp = async (token?: string): Promise<Page> => {
      app = await electron.launch({
        executablePath: electronExecutable,
        cwd: electronAppDir,
        args: [electronAppDir],
        env: {
          ...process.env,
          MILADY_ELECTRON_SKIP_EMBEDDED_AGENT: "1",
          MILADY_ELECTRON_TEST_API_BASE: api.baseUrl,
          MILADY_ELECTRON_DISABLE_AUTO_UPDATER: "1",
          MILADY_ELECTRON_DISABLE_DEVTOOLS: "1",
          MILADY_ELECTRON_USER_DATA_DIR: userDataDir,
          MILADY_API_TOKEN: token ?? "",
        },
      });
      return app.firstWindow();
    };

    const ensureOnboardingReady = async (page: Page): Promise<"chat" | "onboarding"> => {
      const pairingHeading = page.getByRole("heading", { name: /pairing required/i });
      const onboardingWelcome = page.getByText(/welcome to milady!/i);
      const chatInput = page.getByPlaceholder("Type a message...");

      let pairingAttempts = 0;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const hasPairing = await pairingHeading.isVisible().catch(() => false);
        const hasOnboarding = await onboardingWelcome.isVisible().catch(() => false);
        const hasChat = await chatInput.isVisible().catch(() => false);

        if (hasChat) {
          return "chat";
        }
        if (hasOnboarding) {
          return "onboarding";
        }
        if (hasPairing && pairingAttempts < 3) {
          pairingAttempts += 1;
          await page.getByLabel("Pairing Code").fill("1234-5678");
          await page.getByRole("button", { name: /^submit$/i }).click();
          await page.waitForTimeout(1_000);
          continue;
        }

        await page.waitForTimeout(750);
      }

      const snapshot = await page.evaluate(() => ({
        title: document.title,
        body: (document.body?.innerText ?? "").slice(0, 1_200),
      }));

      throw new Error(
        `Onboarding did not reach chat or onboarding after auth transition. title=${snapshot.title}\n${snapshot.body}`,
      );
    };

    const unauthPage = await launchApp();
    await expect(unauthPage.getByRole("heading", { name: /pairing required/i })).toBeVisible({
      timeout: 60_000,
    });
    await app.close();
    app = null;

    const page = await launchApp("desktop-auth-token");
    const entryState = await ensureOnboardingReady(page);
    if (entryState === "chat") {
      await expect(page.getByPlaceholder("Type a message...")).toBeVisible({ timeout: 30_000 });
      expect(api.requests).toContain("GET /api/auth/status");
      expect(api.requests).toContain("GET /api/onboarding/status");
      return;
    }

    await clickOnboardingNext(page); // welcome -> name
    await page.getByRole("button", { name: "Milady", exact: true }).click();
    await clickOnboardingNext(page); // name -> avatar
    await clickOnboardingNext(page); // avatar -> style
    await page.getByRole("button", { name: /chaotic/i }).click();
    await clickOnboardingNext(page); // style -> theme
    await page.getByRole("button", { name: /milady/i }).first().click();
    await clickOnboardingNext(page); // theme -> runMode
    await page.getByRole("button", { name: /local \(raw\)/i }).click();
    await clickOnboardingNext(page); // runMode -> llm provider
    await page.getByRole("button", { name: /ollama/i }).first().click();
    await clickOnboardingNext(page); // llm provider -> inventory setup
    await clickOnboardingNext(page); // inventory setup -> connectors
    await clickOnboardingNext(page); // connectors -> permissions

    await expect(page.getByRole("button", { name: /^continue$/i })).toHaveCount(0);

    await page.getByRole("button", { name: /^grant$/i }).nth(0).click();
    await page.getByRole("button", { name: /^grant$/i }).nth(0).click();
    await page.getByRole("button", { name: /^grant$/i }).nth(0).click();

    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({ timeout: 45_000 });
    expect(api.requests).toContain("GET /api/auth/status");
    expect(api.requests).toContain("GET /api/onboarding/status");
  } finally {
    await app?.close();
    await api?.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
