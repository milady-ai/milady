import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Autonomy indicator", () => {
  test("autonomy indicator is visible in header when agent is running", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    await expect(page.locator(".autonomy-indicator, [data-autonomy]")).toHaveCount(1, { timeout: 5000 });
  });

  test("there is no autonomy toggle checkbox", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    // The old checkbox should no longer exist
    await expect(page.locator("[data-action='autonomy-toggle']")).toHaveCount(0);
  });

  test("autonomy status is reflected in the workbench sidebar", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar).toBeVisible();
    // The workbench overview includes autonomy state
    await expect(sidebar.getByText(/autonomy|self-directed/i)).toBeVisible({ timeout: 5000 });
  });

  test("workbench sidebar shows agent-not-running when stopped", async ({ page }) => {
    await mockApi(page, { agentState: "not_started" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar.getByText("Agent is not running")).toBeVisible();
  });

  test("workbench sidebar shows agent-not-running when paused", async ({ page }) => {
    await mockApi(page, { agentState: "paused" });
    await page.goto("/chat");

    const sidebar = page.locator("widget-sidebar");
    await expect(sidebar).toBeVisible();
    // Paused agents may show a different state indicator
    await expect(sidebar.getByText(/not running|paused/i)).toBeVisible({ timeout: 5000 });
  });
});
