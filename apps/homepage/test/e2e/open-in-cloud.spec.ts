import { expect, type Page, test } from "@playwright/test";
import {
  loginViaPolling,
  mockCloudApi,
  seedCloudAuth,
} from "./fixtures/cloud-auth";

const RUNNING_AGENT = {
  id: "agent-running-1",
  name: "milady-existing",
  agentName: "milady-existing",
  status: "running",
  webUiUrl: "https://agent-running-1.milady.ai",
};

const REDIRECT_URL_HAPPY =
  "https://agent-running-1.milady.ai/pair?token=tok-happy";
const REDIRECT_URL_AUTO_PROVISION =
  "https://created-1.milady.ai/pair?token=tok-provisioned";
const REDIRECT_URL_AFTER_POLLING =
  "https://agent-running-1.milady.ai/pair?token=tok-polling";
const REDIRECT_URL_AFTER_LOGIN =
  "https://created-1.milady.ai/pair?token=tok-login";

const CLOUD_BUTTON_SELECTOR = 'button[aria-label="Open Milady in the cloud"]';
const CANCEL_BUTTON_SELECTOR =
  'button[aria-label="Cancel opening Milady in the cloud"]';
const WEB_PLATFORM_SELECTOR = 'button[aria-label="Open Milady web"]';

async function clickOpenInCloud(page: Page): Promise<Page> {
  const popupPromise = page.context().waitForEvent("page");
  await page.locator(CLOUD_BUTTON_SELECTOR).click();
  return popupPromise;
}

test.describe("homepage - open in cloud", () => {
  test("happy path: existing running cloud agent redirects", async ({
    page,
  }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [RUNNING_AGENT],
      pairingResponses: [{ kind: "ready", redirectUrl: REDIRECT_URL_HAPPY }],
    });

    await page.goto("/");
    await expect(page.locator(CLOUD_BUTTON_SELECTOR)).toBeVisible();

    const popup = await clickOpenInCloud(page);
    await popup.waitForURL(REDIRECT_URL_HAPPY, { timeout: 15_000 });
    expect(popup.url()).toBe(REDIRECT_URL_HAPPY);
  });

  test("top WEB platform control opens cloud", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [RUNNING_AGENT],
      pairingResponses: [{ kind: "ready", redirectUrl: REDIRECT_URL_HAPPY }],
    });

    await page.goto("/");
    await expect(page.locator(WEB_PLATFORM_SELECTOR)).toBeVisible();

    const popupPromise = page.context().waitForEvent("page");
    await page.locator(WEB_PLATFORM_SELECTOR).click();
    const popup = await popupPromise;
    await popup.waitForURL(REDIRECT_URL_HAPPY, { timeout: 15_000 });
    expect(popup.url()).toBe(REDIRECT_URL_HAPPY);
  });

  test("auto-provision: no agents creates, provisions, polls, then redirects", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [],
      jobStatuses: [{ status: "completed" }],
      pairingResponses: [
        { kind: "ready", redirectUrl: REDIRECT_URL_AUTO_PROVISION },
      ],
    });

    await page.goto("/");
    await expect(page.locator(CLOUD_BUTTON_SELECTOR)).toBeVisible();

    const popup = await clickOpenInCloud(page);
    await popup.waitForURL(REDIRECT_URL_AUTO_PROVISION, { timeout: 30_000 });
    expect(popup.url()).toBe(REDIRECT_URL_AUTO_PROVISION);

    const counts = state.callCounts();
    expect(counts.createAgent).toBe(1);
    expect(counts.provisionAgent).toBe(1);
    expect(counts.jobStatus).toBeGreaterThanOrEqual(1);
    expect(counts.pairingToken).toBe(1);
  });

  test("pairing 202 polling drains pending replies before redirecting", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [RUNNING_AGENT],
      pairingResponses: [
        { kind: "pending", retryAfterMs: 0 },
        { kind: "pending", retryAfterMs: 0 },
        { kind: "ready", redirectUrl: REDIRECT_URL_AFTER_POLLING },
      ],
    });

    await page.goto("/");
    await expect(page.locator(CLOUD_BUTTON_SELECTOR)).toBeVisible();

    const popup = await clickOpenInCloud(page);
    await popup.waitForURL(REDIRECT_URL_AFTER_POLLING, { timeout: 15_000 });
    expect(popup.url()).toBe(REDIRECT_URL_AFTER_POLLING);
    expect(state.callCounts().pairingToken).toBe(3);
  });

  test("cancel button resets to idle", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [RUNNING_AGENT],
      // Leave pairingResponses empty + force a long pending cycle so the
      // popup never redirects on its own.
      pairingResponses: [{ kind: "pending", retryAfterMs: 60_000 }],
    });

    await page.goto("/");
    const cloudButton = page.locator(CLOUD_BUTTON_SELECTOR);
    await expect(cloudButton).toBeVisible();

    const popupPromise = page.context().waitForEvent("page");
    await cloudButton.click();
    const popup = await popupPromise;
    expect(popup.isClosed()).toBe(false);

    const cancelButton = page.locator(CANCEL_BUTTON_SELECTOR);
    await expect(cancelButton).toBeVisible();
    await expect(cancelButton).toContainText("cancel opening");

    await cancelButton.click();

    await expect(page.locator(CLOUD_BUTTON_SELECTOR)).toBeVisible();
    await expect(page.locator(CANCEL_BUTTON_SELECTOR)).toHaveCount(0);
    await popup.waitForEvent("close", { timeout: 5_000 }).catch(() => {
      // Some browsers report a closed popup without firing the close event;
      // fall back to checking the closed state instead of failing.
    });
    expect(popup.isClosed()).toBe(true);
  });

  test("sign-in needed: cli-session poll redirects after auth", async ({
    page,
  }) => {
    // Start unauthenticated.
    await mockCloudApi(page.context(), {
      agents: [],
      // After login, the homepage lists agents, creates one, provisions it,
      // then fetches a pairing token.
      jobStatuses: [{ status: "completed" }],
      pairingResponses: [
        { kind: "ready", redirectUrl: REDIRECT_URL_AFTER_LOGIN },
      ],
      cliSessionPolls: [
        { status: "pending" },
        { status: "authenticated", apiKey: "test-cloud-api-key" },
      ],
    });

    // The secondary login window uses noopener, so it is not observable as a
    // Playwright page. The primary "open in cloud" popup is captured below.
    await page.addInitScript(() => {
      const origOpen = window.open.bind(window);
      window.open = ((
        url?: string | URL,
        target?: string,
        features?: string,
      ) => {
        if (typeof features === "string" && features.includes("noopener")) {
          return null;
        }
        return origOpen(url ?? "", target, features);
      }) as typeof window.open;
    });

    await page.goto("/");
    const cloudButton = page.locator(CLOUD_BUTTON_SELECTOR);
    await expect(cloudButton).toBeVisible();

    const popupPromise = page.context().waitForEvent("page");
    await cloudButton.click();
    const popup = await popupPromise;

    // The popup should show the sign-in prompt before login completes.
    // The page is same-origin (about:blank inheriting) so we can read DOM.
    await expect
      .poll(
        async () =>
          (await popup
            .locator("#milady-popup-message")
            .textContent()
            .catch(() => null)) ?? "",
        { timeout: 5_000 },
      )
      .toContain("Sign in to Eliza Cloud");

    // Once cli-session polling authenticates, the cloud-open flow resumes.
    await popup.waitForURL(REDIRECT_URL_AFTER_LOGIN, { timeout: 30_000 });
    expect(popup.url()).toBe(REDIRECT_URL_AFTER_LOGIN);
  });

  test.afterEach(async ({ page }) => {
    // Clear leftover localStorage between tests.
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
    void seedCloudAuth; // keep import live
  });
});
