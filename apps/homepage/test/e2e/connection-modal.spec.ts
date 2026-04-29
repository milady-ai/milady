import { expect, type Page, test } from "@playwright/test";
import { mockCloudApi, mockRemoteAgent } from "./fixtures/cloud-auth";

const ATTACH_REMOTE_NAV_BUTTON_TEXT = "attach remote";

interface StoredConnection {
  id: string;
  name: string;
  url: string;
  type: string;
  authToken?: string;
}

async function openAttachRemoteModal(page: Page): Promise<void> {
  // The sidebar exposes a "+ attach remote" button. Click the visible one
  // (desktop sidebar on Chromium).
  const trigger = page.getByRole("button", {
    name: ATTACH_REMOTE_NAV_BUTTON_TEXT,
  });
  await trigger.first().click();
  await expect(
    page.getByRole("dialog", { name: /paste any milady, elizaos/i }),
  ).toBeVisible();
}

async function readConnections(page: Page): Promise<StoredConnection[]> {
  const raw = await page.evaluate(() =>
    localStorage.getItem("milady-connections"),
  );
  if (!raw) return [];
  return JSON.parse(raw) as StoredConnection[];
}

test.describe("homepage - attach-remote connection modal", () => {
  test.afterEach(async ({ page }) => {
    await page
      .evaluate(() => {
        try {
          localStorage.clear();
        } catch {}
      })
      .catch(() => undefined);
  });

  test("submits a valid remote URL, agent appears in grid", async ({
    page,
  }) => {
    await mockCloudApi(page.context(), { agents: [] });
    const remoteUrl = "https://my-remote-agent.example.test";
    const remoteState = await mockRemoteAgent(page.context(), remoteUrl, {
      status: { state: "running", agentName: "remote-buddy" },
    });

    await page.goto("/");
    await openAttachRemoteModal(page);

    await page.locator("#connect-name").fill("remote-buddy");
    await page.locator("#connect-url").fill(remoteUrl);
    await page.getByRole("button", { name: "attach", exact: true }).click();

    // Toast confirms attach.
    await expect(page.getByText("remote-buddy attached.")).toBeVisible({
      timeout: 10_000,
    });

    const conns = await readConnections(page);
    expect(conns).toHaveLength(1);
    expect(conns[0]).toMatchObject({
      name: "remote-buddy",
      url: remoteUrl,
      type: "remote",
    });
    expect(conns[0].authToken).toBeUndefined();

    // Grid should pick up the remote runtime once health/status probes resolve.
    await expect(
      page.getByRole("heading", { name: "remote-buddy" }),
    ).toBeVisible({ timeout: 15_000 });

    expect(remoteState.totalRequests()).toBeGreaterThan(0);
  });

  test("invalid URL: empty submit stays disabled", async ({ page }) => {
    await mockCloudApi(page.context(), { agents: [] });

    await page.goto("/");
    await openAttachRemoteModal(page);

    const submit = page.getByRole("button", { name: "attach", exact: true });
    await expect(submit).toBeDisabled();

    // Name without URL still disabled.
    await page.locator("#connect-name").fill("name-only");
    await expect(submit).toBeDisabled();

    // URL without name still disabled.
    await page.locator("#connect-name").fill("");
    await page.locator("#connect-url").fill("https://example.test");
    await expect(submit).toBeDisabled();

    // Whitespace name doesn't satisfy trim() check.
    await page.locator("#connect-name").fill("   ");
    await expect(submit).toBeDisabled();
  });

  test("optional auth token is forwarded as Authorization: Bearer", async ({
    page,
  }) => {
    await mockCloudApi(page.context(), { agents: [] });
    const remoteUrl = "https://secured-remote.example.test";
    const remoteState = await mockRemoteAgent(page.context(), remoteUrl);

    await page.goto("/");
    await openAttachRemoteModal(page);

    await page.locator("#connect-name").fill("with-token");
    await page.locator("#connect-url").fill(remoteUrl);
    await page.locator("#connect-token").fill("milady_secret_test_token");
    await page.getByRole("button", { name: "attach", exact: true }).click();

    // Wait for the agent to surface in the grid so we know health probes ran.
    await expect(page.getByRole("heading", { name: "with-token" })).toBeVisible(
      { timeout: 15_000 },
    );

    const conns = await readConnections(page);
    expect(conns[0].authToken).toBe("milady_secret_test_token");

    const seenAuth = remoteState.seenAuthHeaders();
    expect(seenAuth.length).toBeGreaterThan(0);
    expect(
      seenAuth.some((header) => header === "Bearer milady_secret_test_token"),
    ).toBe(true);
  });
});
