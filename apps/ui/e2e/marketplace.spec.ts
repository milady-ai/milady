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

  test("renders both registry plugins", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    await expect(page.getByText("@elizaos/plugin-openrouter")).toBeVisible();
    await expect(page.getByText("@elizaos/plugin-vercel-ai-gateway")).toBeVisible();
  });

  test("shows different trust scores per plugin", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    // openrouter has trust score 76, vercel-ai-gateway has 68
    const openRouterCard = page.locator(".plugin-item", { hasText: "@elizaos/plugin-openrouter" });
    const gatewayCard = page.locator(".plugin-item", { hasText: "@elizaos/plugin-vercel-ai-gateway" });

    await expect(openRouterCard.getByText("Trust: medium (76)")).toBeVisible();
    await expect(gatewayCard.getByText("Trust: medium (68)")).toBeVisible();
  });

  test("shows plugin descriptions", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    await expect(page.getByText("OpenRouter model provider plugin")).toBeVisible();
    await expect(page.getByText("Vercel AI Gateway provider plugin")).toBeVisible();
  });

  test("search filters plugins by name", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    // Both plugins visible initially
    await expect(page.getByText("@elizaos/plugin-openrouter")).toBeVisible();
    await expect(page.getByText("@elizaos/plugin-vercel-ai-gateway")).toBeVisible();

    // Search for "vercel" should narrow results
    const searchInput = page.locator("input[placeholder*='Search']").first();
    await searchInput.fill("vercel");
    await searchInput.press("Enter");
    await page.waitForTimeout(300);

    await expect(page.getByText("@elizaos/plugin-vercel-ai-gateway")).toBeVisible();
  });

  test("uninstall then install round-trip preserves plugin state", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/marketplace");

    const openRouterCard = page.locator(".plugin-item", { hasText: "@elizaos/plugin-openrouter" });

    // Initially installed — should have Uninstall button
    await expect(openRouterCard.getByRole("button", { name: "Uninstall" })).toBeVisible();

    // Uninstall
    await openRouterCard.getByRole("button", { name: "Uninstall" }).click();
    await expect(openRouterCard.getByRole("button", { name: "Install" })).toBeVisible();

    // Re-install
    await openRouterCard.getByRole("button", { name: "Install" }).click();
    await expect(openRouterCard.getByRole("button", { name: "Uninstall" })).toBeVisible();

    // Uninstall again to prove toggle is repeatable
    await openRouterCard.getByRole("button", { name: "Uninstall" }).click();
    await expect(openRouterCard.getByRole("button", { name: "Install" })).toBeVisible();
  });
});
