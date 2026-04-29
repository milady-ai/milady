import { expect, type Page, test } from "@playwright/test";
import { mockCloudApi } from "./fixtures/cloud-auth";

const SIGN_IN_BUTTON_TEXT = "sign in to cloud";
const CLOUD_TOKEN_STORAGE_KEY = "milady-cloud-token:elizacloud.ai";

async function readStoredToken(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    CLOUD_TOKEN_STORAGE_KEY,
  );
}

async function clickSignIn(page: Page): Promise<void> {
  // The sign-in button lives in SessionTile inside the sidebar. The desktop
  // sidebar is hidden on lg viewports, but Playwright's default is desktop
  // chrome so the visible-text query resolves to the desktop instance.
  const button = page.getByRole("button", { name: SIGN_IN_BUTTON_TEXT });
  await expect(button).toBeVisible();
  await button.click();
}

test.describe("homepage - sign-in flow", () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
  });

  test("successful sign-in stores token and flips UI to authed", async ({
    page,
  }) => {
    const state = await mockCloudApi(page.context(), {
      cliSessionPolls: [
        { status: "pending" },
        { status: "authenticated", apiKey: "real-token-success" },
      ],
    });

    // Block the popup window so we don't have to manage it; the manual
    // fallback link will appear, which is fine — the polling loop is what
    // we care about for storing the token.
    await page.addInitScript(() => {
      window.open = (() => null) as typeof window.open;
    });

    await page.goto("/");
    await clickSignIn(page);

    await expect
      .poll(async () => readStoredToken(page), { timeout: 15_000 })
      .toBe("real-token-success");

    // Once authenticated, the sign-in button is replaced with "sign out".
    await expect(page.getByRole("button", { name: "sign out" })).toBeVisible();
    expect(state.callCounts().cliSessionCreate).toBeGreaterThanOrEqual(1);
    expect(state.callCounts().cliSessionPoll).toBeGreaterThanOrEqual(1);
  });

  test("expired session surfaces error notice", async ({ page }) => {
    await mockCloudApi(page.context(), {
      cliSessionPolls: [{ status: "expired" }],
    });

    await page.addInitScript(() => {
      window.open = (() => null) as typeof window.open;
    });

    await page.goto("/");
    await clickSignIn(page);

    // useCloudLogin renders the error notice in App.tsx — match the literal
    // copy from useCloudLogin's expired branch.
    await expect(
      page.getByText("Session expired. Please try again."),
    ).toBeVisible({
      timeout: 15_000,
    });

    expect(await readStoredToken(page)).toBeNull();
  });

  test("5-minute deadline times out using clock fast-forward", async ({
    page,
  }) => {
    // Install Playwright's mocked clock BEFORE navigation so React's Date.now
    // and setInterval callbacks are intercepted from the very first render.
    // Use a fixed start time so we can fast-forward deterministically.
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });

    await mockCloudApi(page.context(), {
      // Pre-queue many "pending" replies so the poll never authenticates.
      cliSessionPolls: Array.from({ length: 200 }, () => ({
        status: "pending" as const,
      })),
    });

    await page.addInitScript(() => {
      window.open = (() => null) as typeof window.open;
    });

    await page.goto("/");
    // Let React mount and idle event listeners attach. Playwright's clock
    // pauses time, so we must advance it to give the page a chance to render.
    await page.clock.runFor(1000);

    await clickSignIn(page);

    // Push the clock past the 5-minute deadline; the next poll iteration
    // should detect Date.now() > deadline and flip into the timeout error.
    // 5 minutes 30 seconds in milliseconds. Playwright's mm:ss format
    // requires zero-padded values; passing a number is unambiguous.
    await page.clock.fastForward(5 * 60 * 1000 + 30 * 1000);

    await expect(
      page.getByText("Login timed out. Please try again."),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("popup blocked surfaces manual fallback link", async ({ page }) => {
    await mockCloudApi(page.context(), {
      cliSessionPolls: [{ status: "pending" }],
    });

    await page.addInitScript(() => {
      window.open = ((
        _url?: string | URL,
        _target?: string,
        _features?: string,
      ) => null) as typeof window.open;
    });

    await page.goto("/");
    await clickSignIn(page);

    // The error copy from useCloudLogin's popup-blocked branch.
    await expect(
      page.getByText(
        "Couldn't open the sign-in window. Open the sign-in page and finish there.",
      ),
    ).toBeVisible({ timeout: 15_000 });

    const manualLink = page.getByRole("link", {
      name: "Open sign-in page manually",
    });
    await expect(manualLink).toBeVisible();
    const href = await manualLink.getAttribute("href");
    expect(href).toMatch(/\/auth\/cli-login\?session=/);
  });
});
