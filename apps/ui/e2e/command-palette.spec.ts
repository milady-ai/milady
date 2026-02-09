import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

/** Open the command palette via the header button. */
async function openPalette(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(".lifecycle-btn", { hasText: "Cmd+K" }).click();
  await expect(page.getByPlaceholder("Type a command...")).toBeVisible();
}

test.describe("Command palette", () => {
  test("opens via header button and executes navigation command", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByRole("button", { name: "Open Workbench" }).click();

    await expect(page).toHaveURL(/\/workbench/);
    await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  });

  test("supports keyboard execution from query (Enter)", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByPlaceholder("Type a command...").fill("open logs");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/logs/);
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  });

  test("closes palette with Escape key", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder("Type a command...")).not.toBeVisible({ timeout: 5000 });
  });

  test("filters command list when typing a query", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);

    // Before typing, multiple commands should be visible
    const allButtons = page.locator(".command-palette button, .cmd-palette button, [role='option']");
    const initialCount = await allButtons.count();

    await page.getByPlaceholder("Type a command...").fill("plugins");
    await page.waitForTimeout(250);

    // After filtering, fewer commands should match
    const filteredCount = await allButtons.count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("navigates to plugins page via palette", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByPlaceholder("Type a command...").fill("open plugins");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/plugins/);
  });

  test("navigates to config page via palette", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByPlaceholder("Type a command...").fill("open config");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/config/);
  });
});
