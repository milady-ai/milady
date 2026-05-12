import { expect, type Page, test } from "@playwright/test";
import {
  type CloudAgentFixture,
  loginViaPolling,
  mockCloudApi,
  mockRemoteAgent,
} from "./fixtures/cloud-auth";

const RUNNING_CLOUD_AGENT: CloudAgentFixture = {
  id: "cloud-running-1",
  name: "delete-me",
  agentName: "delete-me",
  status: "running",
  webUiUrl: "https://cloud-running-1.milady.ai",
};

const PROVISIONING_CLOUD_AGENT: CloudAgentFixture = {
  id: "cloud-prov-1",
  name: "still-booting",
  agentName: "still-booting",
  status: "provisioning",
};

interface StoredConnection {
  id: string;
  name: string;
  url: string;
  type: string;
  authToken?: string;
}

async function seedRemoteConnection(
  page: Page,
  conn: StoredConnection,
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    {
      key: "milady-connections",
      value: JSON.stringify([conn]),
    },
  );
}

async function openCardMenu(page: Page, cardName: string): Promise<void> {
  const card = page
    .locator("article", {
      has: page.getByRole("heading", { name: cardName }),
    })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "More actions" }).click();
}

test.describe("homepage - instance card menu", () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
  });

  test("delete cloud agent: confirm -> DELETE -> card removed", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [RUNNING_CLOUD_AGENT],
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: RUNNING_CLOUD_AGENT.name }),
    ).toBeVisible({ timeout: 10_000 });

    await openCardMenu(page, RUNNING_CLOUD_AGENT.name);
    const deleteItem = page.getByRole("menuitem", { name: "delete agent" });
    await deleteItem.click();

    // After first click the same menuitem becomes "confirm delete?".
    const confirm = page.getByRole("menuitem", { name: "confirm delete?" });
    await expect(confirm).toBeVisible();

    // After confirm click, deleteCloudAgent runs and refresh() returns the
    // (now-mutated) agents list. We need the mock to reflect the deletion.
    state.setAgents([]);
    await confirm.click();

    await expect(
      page.getByText(`${RUNNING_CLOUD_AGENT.name} deleted.`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: RUNNING_CLOUD_AGENT.name }),
    ).toHaveCount(0, { timeout: 10_000 });
    expect(state.callCounts().deleteAgent).toBe(1);
  });

  test("delete failure surfaces error notice and keeps card", async ({
    page,
  }) => {
    await loginViaPolling(page);
    const state = await mockCloudApi(page.context(), {
      agents: [RUNNING_CLOUD_AGENT],
    });
    state.setDeleteResponse({
      status: 500,
      body: JSON.stringify({ success: false, error: "internal explosion" }),
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: RUNNING_CLOUD_AGENT.name }),
    ).toBeVisible({ timeout: 10_000 });

    await openCardMenu(page, RUNNING_CLOUD_AGENT.name);
    await page.getByRole("menuitem", { name: "delete agent" }).click();
    await page.getByRole("menuitem", { name: "confirm delete?" }).click();

    // Error notice contains "delete failed:" prefix from App.tsx's
    // handleDeleteCloud.
    await expect(page.getByText(/delete failed:/i)).toBeVisible({
      timeout: 10_000,
    });

    // Card remains.
    await expect(
      page.getByRole("heading", { name: RUNNING_CLOUD_AGENT.name }),
    ).toBeVisible();
    expect(state.callCounts().deleteAgent).toBe(1);
  });

  test("forget remote: connection removed from localStorage and card vanishes", async ({
    page,
  }) => {
    const remoteUrl = "https://forgettable.example.test";
    await seedRemoteConnection(page, {
      id: "remote-id-1",
      name: "forgettable",
      url: remoteUrl,
      type: "remote",
    });
    await mockCloudApi(page.context(), { agents: [] });
    await mockRemoteAgent(page.context(), remoteUrl, {
      status: { state: "running", agentName: "forgettable" },
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "forgettable" }),
    ).toBeVisible({ timeout: 15_000 });

    await openCardMenu(page, "forgettable");
    await page.getByRole("menuitem", { name: "forget connection" }).click();

    await expect(
      page.getByText("forgettable removed from saved remote connections."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "forgettable" }),
    ).toHaveCount(0, { timeout: 10_000 });

    const stored = await page.evaluate(() =>
      localStorage.getItem("milady-connections"),
    );
    expect(stored ? JSON.parse(stored) : []).toEqual([]);
  });

  test("disabled-open state for provisioning agent shows starting copy and blocks open", async ({
    page,
  }) => {
    await loginViaPolling(page);
    await mockCloudApi(page.context(), {
      agents: [PROVISIONING_CLOUD_AGENT],
    });

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: PROVISIONING_CLOUD_AGENT.name }),
    ).toBeVisible({ timeout: 10_000 });

    const card = page
      .locator("article", {
        has: page.getByRole("heading", {
          name: PROVISIONING_CLOUD_AGENT.name,
        }),
      })
      .first();

    // The disabled variant shows italic "starting…" — the live "open" text
    // should not be present in this card. ("starting" appears in both the
    // StatusDot label and the disabled button label, so just assert at least
    // one is visible.)
    await expect(
      card.getByText("starting", { exact: false }).first(),
    ).toBeVisible();
    await expect(card.getByText(/^open$/)).toHaveCount(0);

    // The disabled button itself is rendered with disabled+aria-disabled.
    const disabledBtn = card
      .locator('button[aria-disabled="true"][disabled]')
      .first();
    await expect(disabledBtn).toBeVisible();

    // Clicking should NOT trigger window.open / a popup. Track popup events
    // on the context and assert no new page is created.
    let popupCount = 0;
    const onPopup = () => {
      popupCount += 1;
    };
    page.context().on("page", onPopup);
    // Force-click to override the disabled pointer-events so we know the
    // disabled attribute (not styling) is what suppresses the open call.
    await disabledBtn.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    page.context().off("page", onPopup);
    expect(popupCount).toBe(0);
  });
});
