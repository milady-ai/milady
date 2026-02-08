import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Command palette", () => {
  test("opens via Cmd/Ctrl+K and executes navigation command", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.keyboard.press("Meta+K").catch(async () => {
      await page.keyboard.press("Control+K");
    });

    await expect(page.getByPlaceholder("Type a command...")).toBeVisible();
    await page.getByRole("button", { name: "Open Workbench" }).click();

    await expect(page).toHaveURL(/\/workbench/);
    await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  });

  test("supports keyboard execution from query (Enter)", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");

    await page.keyboard.press("Meta+K").catch(async () => {
      await page.keyboard.press("Control+K");
    });

    await expect(page.getByPlaceholder("Type a command...")).toBeVisible();
    await page.getByPlaceholder("Type a command...").fill("open logs");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/logs/);
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  });
});
