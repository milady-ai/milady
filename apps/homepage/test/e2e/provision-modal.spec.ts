import { expect, type Page, test } from "@playwright/test";
import {
  type CloudAgentFixture,
  loginViaPolling,
  mockCloudApi,
} from "./fixtures/cloud-auth";

const SEED_AGENT: CloudAgentFixture = {
  id: "seed-1",
  name: "seed-agent",
  agentName: "seed-agent",
  status: "running",
  webUiUrl: "https://seed-1.milady.ai",
};

const NEW_AGENT_BUTTON = 'button[aria-label="Create new cloud agent"]';
const NAME_INPUT_ID = "#provision-name";
const SUBMIT_BUTTON_TEXT = /create agent|provisioning/i;

async function openProvisionModal(page: Page): Promise<void> {
  await page.locator(NEW_AGENT_BUTTON).click();
  await expect(
    page.getByRole("dialog", { name: /spin up an agent/i }),
  ).toBeVisible();
}

test.describe("homepage - provision agent modal", () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
  });

  test("happy path: create -> provision -> done -> auto-close", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [SEED_AGENT],
      jobStatuses: [{ status: "in_progress" }, { status: "completed" }],
    });

    await page.goto("/");
    await expect(page.locator(NEW_AGENT_BUTTON)).toBeVisible();
    await openProvisionModal(page);

    await page.locator(NAME_INPUT_ID).fill("scout-test");
    const submit = page.getByRole("button", { name: SUBMIT_BUTTON_TEXT });
    await submit.click();

    // The status line cycles through working -> done; "agent is live." is the
    // final visible string before auto-close fires after 2.5s.
    await expect(page.getByText("agent is live.")).toBeVisible({
      timeout: 30_000,
    });

    // Modal should auto-close ~2.5s after "done"; allow some slack.
    await expect(
      page.getByRole("dialog", { name: /spin up an agent/i }),
    ).toBeHidden({ timeout: 10_000 });

    const counts = state.callCounts();
    expect(counts.createAgent).toBe(1);
    expect(counts.provisionAgent).toBe(1);
    expect(counts.jobStatus).toBeGreaterThanOrEqual(1);
  });

  test("empty name keeps submit disabled", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), { agents: [SEED_AGENT] });

    await page.goto("/");
    await openProvisionModal(page);

    const submit = page.getByRole("button", { name: "create agent" });
    await expect(submit).toBeDisabled();

    // Whitespace alone doesn't satisfy the trim() check.
    await page.locator(NAME_INPUT_ID).fill("   ");
    await expect(submit).toBeDisabled();

    await page.locator(NAME_INPUT_ID).fill("ok");
    await expect(submit).toBeEnabled();
  });

  test("provision failure surfaces backend error string", async ({ page }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [SEED_AGENT],
      jobStatuses: [{ status: "failed", error: "out of credits" }],
    });

    await page.goto("/");
    await openProvisionModal(page);
    await page.locator(NAME_INPUT_ID).fill("doomed-agent");
    await page.getByRole("button", { name: SUBMIT_BUTTON_TEXT }).click();

    await expect(page.getByText("out of credits")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("provision timeout via clock fast-forward", async ({ page }) => {
    // The modal polls every 2.5s up to 48 times before surfacing a timeout.
    // We use page.clock to fast-forward through those intervals deterministically
    // instead of waiting 120 real seconds.
    //
    // Strategy: install the clock BEFORE the page loads so the modal's
    // setTimeout calls are intercepted, then loop runFor(2500) + a tiny real
    // waitForTimeout to flush microtasks (fetch resolution + setState +
    // the next setTimeout registration) between iterations. This matches
    // the modal's recursive setTimeout pattern faithfully.
    await loginViaPolling(page);
    // Queue 60 "in_progress" responses so every poll attempt sees pending
    // (cap is 48; we add buffer).
    const jobStatuses = Array.from({ length: 60 }, () => ({
      status: "in_progress" as const,
    }));
    await mockCloudApi(page.context(), {
      agents: [SEED_AGENT],
      jobStatuses,
    });

    await page.clock.install();
    await page.goto("/");
    // Let React mount + initial useEffects fire under the fake clock.
    await page.clock.runFor(1000);

    await openProvisionModal(page);
    await page.locator(NAME_INPUT_ID).fill("timeout-agent");
    await page.getByRole("button", { name: SUBMIT_BUTTON_TEXT }).click();

    // First poll (attempt=0) is invoked synchronously after provisionAgent
    // resolves, no setTimeout yet. Give microtasks time to flush so attempt=0
    // completes and schedules the setTimeout for attempt=1.
    await page.waitForTimeout(100);

    // Step through 50 polling cycles to exceed MAX_POLL_ATTEMPTS=48. Each
    // runFor(2500) fires the pending setTimeout; the awaited fetch returns
    // "in_progress" and schedules the next setTimeout. waitForTimeout(50)
    // is real time — allows the awaited fetch + microtasks to complete
    // before the next clock tick.
    for (let i = 0; i < 50; i++) {
      await page.clock.runFor(2500);
      await page.waitForTimeout(50);
    }

    // The modal copy on timeout: see ProvisionAgentModal.tsx pollJob()
    // when attempt >= MAX_POLL_ATTEMPTS.
    await expect(
      page.getByText(/Provisioning is taking longer than expected/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
