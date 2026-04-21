import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "@playwright/test";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";

const LIVE_TESTS_ENABLED = process.env.MILADY_LIVE_TEST === "1";
const describeLive = describeIf(LIVE_TESTS_ENABLED);
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const APP_ROOT = path.join(REPO_ROOT, "apps/app");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "test-results", "live-onboarding");
const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const READY_TIMEOUT_MS = 120_000;
const UI_SETTLE_MS = 4_000;

type StartedStack = {
  apiBase: string;
  apiChild: ChildProcessWithoutNullStreams;
  browser: Browser;
  stateDir: string;
  uiBase: string;
  viteServer: ViteDevServer;
};

async function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode != null) {
    return true;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const handleExit = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", handleExit);
      child.off("close", handleExit);
    };

    child.once("exit", handleExit);
    child.once("close", handleExit);
  });
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

async function waitForJson<T>(
  url: string,
  timeoutMs: number = READY_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      return await fetchJson<T>(url);
    } catch (error) {
      lastError = error;
      await sleep(1_000);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

async function waitForJsonPredicate<T>(
  url: string,
  predicate: (value: T) => boolean,
  timeoutMs: number = READY_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null = null;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const value = await fetchJson<T>(url);
      lastValue = value;
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000);
  }

  if (lastValue != null) {
    throw new Error(`Timed out waiting for predicate match: ${url}`);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

async function waitForVisibleText(
  page: Page,
  labels: readonly (string | RegExp)[],
  timeoutMs: number = 30_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const label of labels) {
      const locator =
        typeof label === "string"
          ? page.getByText(label, { exact: true }).first()
          : page.getByText(label).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.waitFor({ state: "visible", timeout: 5_000 });
        return locator;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Could not find any of: ${labels.map((label) => String(label)).join(", ")}`,
  );
}

async function clickVisibleText(
  page: Page,
  labels: readonly (string | RegExp)[],
  timeoutMs?: number,
) {
  const deadline = Date.now() + (timeoutMs ?? 30_000);
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    for (const label of labels) {
      const textLocator =
        typeof label === "string"
          ? page.getByText(label, { exact: true }).first()
          : page.getByText(label).first();
      const buttonByRole =
        typeof label === "string"
          ? page.getByRole("button", { exact: true, name: label }).first()
          : page.getByRole("button", { name: label }).first();
      const roleButtonAncestor = textLocator.locator(
        "xpath=ancestor-or-self::*[@role='button'][1]",
      );
      const buttonAncestor = textLocator.locator(
        "xpath=ancestor-or-self::button[1]",
      );

      for (const locator of [
        buttonByRole,
        roleButtonAncestor,
        buttonAncestor,
        textLocator,
      ]) {
        if (!(await locator.isVisible().catch(() => false))) {
          continue;
        }
        try {
          await locator.click({ force: true, timeout: 5_000 });
          return;
        } catch (error) {
          lastError = error;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(
    `Could not click any of: ${labels.map((label) => String(label)).join(", ")}`,
  );
}

async function waitForTestIdEnabled(
  page: Page,
  testId: string,
  timeoutMs: number = READY_TIMEOUT_MS,
) {
  const button = page.getByTestId(testId);
  await button.waitFor({ state: "visible", timeout: timeoutMs });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await button.isEnabled().catch(() => false)) {
      return button;
    }
    await page.waitForTimeout(250);
  }

  throw new Error(`Test id never became enabled: ${testId}`);
}

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const data = await fetchJson<{ models?: Array<{ name?: string }> }>(
      OLLAMA_TAGS_URL,
    );
    return Array.isArray(data.models) && data.models.length > 0;
  } catch {
    return false;
  }
}

async function startRealStack(): Promise<StartedStack> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const stateDir = await mkdtemp(
    path.join(os.tmpdir(), "milady-onboarding-live-"),
  );
  const apiPort = await getFreePort();
  const uiPort = await getFreePort();
  const apiBase = `http://127.0.0.1:${apiPort}`;

  const apiChild = spawn("bun", ["run", "milady", "start"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ELIZA_STATE_DIR: stateDir,
      ELIZA_PORT: String(apiPort),
      FORCE_COLOR: "0",
      MILADY_PORT: String(apiPort),
      MILADY_STATE_DIR: stateDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  apiChild.stdout.on("data", (chunk) => {
    process.stdout.write(`[live-onboarding][api] ${chunk}`);
  });
  apiChild.stderr.on("data", (chunk) => {
    process.stdout.write(`[live-onboarding][api-err] ${chunk}`);
  });

  const onboardingStatus = await waitForJson<{ complete: boolean }>(
    `${apiBase}/api/onboarding/status`,
  );
  if (onboardingStatus.complete) {
    throw new Error(
      "Fresh live onboarding stack unexpectedly started complete",
    );
  }

  process.env.MILADY_API_PORT = String(apiPort);
  const viteServer = await createViteServer({
    configFile: path.join(APP_ROOT, "vite.config.ts"),
    server: {
      hmr: false,
      host: "127.0.0.1",
      port: uiPort,
      strictPort: true,
      watch: null,
    },
  });
  await viteServer.listen();

  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader"],
    headless: true,
  });

  return {
    apiBase,
    apiChild,
    browser,
    stateDir,
    uiBase: `http://127.0.0.1:${uiPort}`,
    viteServer,
  };
}

async function stopRealStack(stack: StartedStack | null): Promise<void> {
  if (!stack) return;

  try {
    await stack.browser.close();
  } catch {
    // Best effort during cleanup.
  }
  try {
    await stack.viteServer.close();
  } catch {
    // Best effort during cleanup.
  }

  if (stack.apiChild.exitCode == null) {
    stack.apiChild.kill("SIGTERM");
    const exitedAfterTerm = await waitForChildExit(stack.apiChild, 5_000);
    if (!exitedAfterTerm && stack.apiChild.exitCode == null) {
      stack.apiChild.kill("SIGKILL");
      await waitForChildExit(stack.apiChild, 5_000);
    }
  }

  await rm(stack.stateDir, { force: true, recursive: true });
}

async function newLivePage(
  stack: StartedStack,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await stack.browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 900, width: 1440 },
  });
  await context.addInitScript(
    () => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("eliza:ui-language", "en");
      localStorage.setItem("milady:ui-language", "en");
      localStorage.setItem("eliza:ui-theme", "dark");
      localStorage.setItem("milady:ui-theme", "dark");
    },
  );

  const page = await context.newPage();
  page.on("console", (message) => {
    console.log(
      `[live-onboarding][browser:${message.type()}] ${message.text()}`,
    );
  });
  page.on("pageerror", (error) => {
    console.log(`[live-onboarding][pageerror] ${error.message}`);
  });

  return { context, page };
}

describeLive("real onboarding handoff to companion mode", () => {
  let canUseOllama = false;
  let stack: StartedStack | null = null;

  beforeAll(async () => {
    canUseOllama = await isOllamaAvailable();
    if (!canUseOllama) {
      throw new Error(
        "MILADY_LIVE_TEST=1 requires a reachable Ollama daemon with at least one local model",
      );
    }
    stack = await startRealStack();
  }, READY_TIMEOUT_MS);

  afterAll(async () => {
    await stopRealStack(stack);
    stack = null;
  }, 30_000);

  it(
    "finishes onboarding against the live server and lands in companion mode",
    async () => {
      if (!stack) {
        throw new Error("Live onboarding stack did not start");
      }

      const { context, page } = await newLivePage(stack);
      try {
        await page.goto(stack.uiBase, { waitUntil: "domcontentloaded" });

        await waitForVisibleText(page, [/Log in with Eliza Cloud/i, /^Skip$/i]);
        await clickVisibleText(page, [/^Skip$/i, /^Continue Offline$/i]);

        await waitForVisibleText(page, [/Continue/i, /Chen/i]);
        await clickVisibleText(page, [/Continue/i]);

        await waitForVisibleText(page, [/Where should .* run\?/i, /^Local$/i]);
        await clickVisibleText(page, [/^Local$/i]);

        await waitForVisibleText(page, [/Choose your AI provider/i, /Ollama/i]);
        await clickVisibleText(page, [/Ollama/i]);

        await waitForVisibleText(page, [/Local models/i, /Confirm/i]);
        await clickVisibleText(page, [/Confirm/i]);

        await waitForVisibleText(page, [
          /Choose your preferred voice provider/i,
          /^Skip$/i,
        ]);
        await clickVisibleText(page, [/^Skip$/i, /^Next$/i]);

        await waitForVisibleText(page, [/Browser Permissions/i, /Continue/i]);
        await clickVisibleText(page, [/Skip for now/i, /Continue/i]);

        await waitForVisibleText(page, [/Setup is complete/i, /^Enter$/i]);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, "onboarding-live-activate-ready.png"),
          timeout: READY_TIMEOUT_MS,
        });
        const enterButton = await waitForTestIdEnabled(
          page,
          "onboarding-activate-enter",
          READY_TIMEOUT_MS,
        );
        await enterButton.click({ force: true, timeout: READY_TIMEOUT_MS });

        await page.waitForURL(/\/companion(?:$|[?#/])/, {
          timeout: READY_TIMEOUT_MS,
        });
        await page
          .locator('[data-testid="companion-root"]')
          .waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
        await page
          .locator('[data-testid="companion-message-row"]')
          .first()
          .waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
        await page.waitForTimeout(UI_SETTLE_MS);

        await page.screenshot({
          path: path.join(
            SCREENSHOT_DIR,
            "onboarding-live-companion-after-enter.png",
          ),
          timeout: READY_TIMEOUT_MS,
        });

        expect(page.url()).toContain("/companion");
        expect(
          await page.locator('[data-testid="companion-root"]').isVisible(),
        ).toBe(true);
        expect(
          await page.getByRole("button", { name: "New Chat" }).isVisible(),
        ).toBe(true);
        expect(
          await page
            .getByRole("button", { name: /Agent voice on|Agent voice off/i })
            .isVisible(),
        ).toBe(true);
        expect(
          await page.locator('[data-testid="companion-message-row"]').count(),
        ).toBeGreaterThan(0);

        const onboardingStatus = await waitForJsonPredicate<{
          complete: boolean;
        }>(
          `${stack.apiBase}/api/onboarding/status`,
          (status) => status.complete === true,
          READY_TIMEOUT_MS,
        );
        expect(onboardingStatus.complete).toBe(true);
      } finally {
        await context.close();
      }
    },
    READY_TIMEOUT_MS * 2,
  );
});
