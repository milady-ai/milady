import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Marketplace page", () => {
  test("renders registry plugins and trust signals", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(page.getByText("@elizaos/plugin-openrouter")).toBeVisible();
    await expect(page.getByText("Trust: medium (76)").first()).toBeVisible();
    await expect(page.getByText("Maintenance: updated 12d ago").first()).toBeVisible();
    await expect(page.getByText("Compatibility: v2 package published").first()).toBeVisible();
    await expect(page.getByText("Restart: restart on install").first()).toBeVisible();
    await expect(page.getByText("Supports v2: yes").first()).toBeVisible();
  });

  test("can uninstall and install a plugin", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    const openRouterCard = page.locator(".plugin-item", { hasText: "@elizaos/plugin-openrouter" });
    await openRouterCard.getByRole("button", { name: "Uninstall" }).click();
    await expect(openRouterCard.getByRole("button", { name: "Install" })).toBeVisible();

    await openRouterCard.getByRole("button", { name: "Install" }).click();
    await expect(openRouterCard.getByRole("button", { name: "Uninstall" })).toBeVisible();
  });
});
