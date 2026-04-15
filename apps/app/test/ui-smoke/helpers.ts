import { expect, type Locator, type Page } from "@playwright/test";

export const ROOT_TIMEOUT_MS = 20_000;
export const NAV_TIMEOUT_MS = 12_000;
// These "ready" checks only look for mocked/static UI markers after navigation.
// Full backend/bootstrap waits use the longer per-test and Playwright defaults.
const READY_CHECK_TIMEOUT_MS = 5_000;

type ReadyCheck =
  | { selector: string; text?: never }
  | { selector?: never; text: string };

type EvaluatedReadyCheck = {
  check: ReadyCheck;
  passed: boolean;
};

const DEFAULT_APP_STORAGE: Record<string, string> = {
  "eliza:onboarding-complete": "1",
  "eliza:onboarding:step": "activate",
  "eliza:ui-shell-mode": "native",
  "elizaos:active-server": JSON.stringify({
    id: "local:embedded",
    kind: "local",
    label: "This device",
  }),
};

export async function seedAppStorage(
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> {
  const storage = { ...DEFAULT_APP_STORAGE, ...overrides };
  await page.addInitScript((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value);
    }
  }, storage);
}

async function expectRootReady(page: Page): Promise<void> {
  await expect(page.locator("#root")).toBeVisible({ timeout: ROOT_TIMEOUT_MS });
}

async function expectNoOnboardingRedirect(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/onboarding/, { timeout: NAV_TIMEOUT_MS });
}

export async function openAppPath(
  page: Page,
  targetPath: string,
): Promise<void> {
  await page.goto(targetPath, { waitUntil: "domcontentloaded" });
  await expectRootReady(page);
  await expectNoOnboardingRedirect(page);
}

export async function readLocalStorage(
  page: Page,
  key: string,
): Promise<string | null> {
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
}

async function locatorVisible(
  locator: Locator,
  timeoutMs: number = READY_CHECK_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

function formatReadyCheck(check: ReadyCheck): string {
  if ("selector" in check) {
    return `selector=${check.selector}`;
  }
  return `text=${JSON.stringify(check.text)}`;
}

function readyChecksPassed(
  results: EvaluatedReadyCheck[],
  mode: "any" | "all",
): boolean {
  if (mode === "all") {
    return results.every((result) => result.passed);
  }
  return results.some((result) => result.passed);
}

async function evaluateReadyChecks(
  page: Page,
  checks: readonly ReadyCheck[],
  mode: "any" | "all" = "any",
  timeoutMs: number = READY_CHECK_TIMEOUT_MS,
): Promise<{
  passed: boolean;
  results: EvaluatedReadyCheck[];
}> {
  const results: EvaluatedReadyCheck[] = [];

  for (const check of checks) {
    if ("selector" in check) {
      results.push({
        check,
        passed: await locatorVisible(page.locator(check.selector), timeoutMs),
      });
      continue;
    }
    results.push({
      check,
      passed: await locatorVisible(page.getByText(check.text), timeoutMs),
    });
  }

  return {
    passed: readyChecksPassed(results, mode),
    results,
  };
}

export async function assertReadyChecks(
  page: Page,
  label: string,
  checks: readonly ReadyCheck[],
  mode: "any" | "all" = "any",
  timeoutMs: number = READY_CHECK_TIMEOUT_MS,
): Promise<void> {
  const evaluation = await evaluateReadyChecks(page, checks, mode, timeoutMs);
  const summary = evaluation.results
    .map(
      (result) =>
        `${result.passed ? "pass" : "fail"}:${formatReadyCheck(result.check)}`,
    )
    .join(", ");

  expect(
    evaluation.passed,
    `[playwright-ui-smoke] ${label}: ready checks failed (${summary})`,
  ).toBe(true);
}

/**
 * Baseline API stubs every smoke test that touches the network should install.
 * Call in `beforeEach` before any flow-specific overrides so those can
 * `route.fallback()` through to these defaults for URLs they don't care about.
 */
export async function installDefaultAppRoutes(page: Page): Promise<void> {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/api/agents", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ agents: [] }),
    });
  });

  await page.route("**/api/cloud/status", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: false,
        enabled: false,
        cloudVoiceProxyAvailable: false,
        hasApiKey: false,
      }),
    });
  });
}

/** Handles returned by {@link installCloudWalletImportApiOverrides}. */
export type CloudWalletImportMockApi = {
  lastWalletConfigPut: () => Record<string, unknown> | null;
  stewardStatusRequestCount: () => number;
};

/**
 * Playwright routes that override the ui-smoke API stub for the cloud wallet import flow.
 * Register **after** {@link installDefaultAppRoutes} so these take precedence for matching URLs.
 */
export async function installCloudWalletImportApiOverrides(
  page: Page,
): Promise<CloudWalletImportMockApi> {
  let lastWalletPut: Record<string, unknown> | null = null;
  let stewardStatusHits = 0;

  const initialWalletConfig = {
    selectedRpcProviders: {
      evm: "alchemy",
      bsc: "alchemy",
      solana: "helius-birdeye",
    },
    walletNetwork: "mainnet",
    legacyCustomChains: [],
    alchemyKeySet: true,
    infuraKeySet: false,
    ankrKeySet: false,
    nodeRealBscRpcSet: false,
    quickNodeBscRpcSet: false,
    managedBscRpcReady: false,
    cloudManagedAccess: false,
    heliusKeySet: true,
    birdeyeKeySet: false,
    evmChains: ["ethereum", "base"],
    evmAddress: null,
    solanaAddress: null,
  };

  let walletConfigState: typeof initialWalletConfig = {
    ...initialWalletConfig,
    legacyCustomChains: [...initialWalletConfig.legacyCustomChains],
    evmChains: [...initialWalletConfig.evmChains],
  };

  await page.route("**/api/cloud/status", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        enabled: true,
        cloudVoiceProxyAvailable: true,
        hasApiKey: true,
        userId: "playwright-smoke-user",
      }),
    });
  });

  await page.route("**/api/cloud/credits", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        balance: 100,
        low: false,
        critical: false,
        authRejected: false,
      }),
    });
  });

  await page.route("**/api/wallet/config", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(walletConfigState),
      });
      return;
    }
    if (req.method() === "PUT") {
      const raw = req.postData();
      lastWalletPut = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      const selections = lastWalletPut?.selections as
        | typeof walletConfigState.selectedRpcProviders
        | undefined;
      if (selections) {
        walletConfigState = {
          ...walletConfigState,
          selectedRpcProviders: selections,
          cloudManagedAccess: true,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/wallet/steward-status", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    stewardStatusHits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: false,
        available: false,
        connected: false,
      }),
    });
  });

  await page.route("**/api/wallet/addresses", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ evmAddress: null, solanaAddress: null }),
    });
  });

  await page.route("**/api/wallet/balances", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        evm: null,
        solana: null,
      }),
    });
  });

  await page.route("**/api/wallet/nfts", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ evm: [], solana: null }),
    });
  });

  return {
    lastWalletConfigPut: () => lastWalletPut,
    stewardStatusRequestCount: () => stewardStatusHits,
  };
}

export async function runSoftReadyChecks(
  page: Page,
  label: string,
  checks: ReadyCheck[],
  mode: "any" | "all" = "any",
  timeoutMs: number = READY_CHECK_TIMEOUT_MS,
): Promise<void> {
  const evaluation = await evaluateReadyChecks(page, checks, mode, timeoutMs);
  if (evaluation.passed) {
    return;
  }

  const summary = evaluation.results
    .map(
      (result) =>
        `${result.passed ? "pass" : "fail"}:${formatReadyCheck(result.check)}`,
    )
    .join(", ");
  console.warn(
    `[playwright-ui-smoke] ${label}: ready checks failed (${summary}).`,
  );
}
