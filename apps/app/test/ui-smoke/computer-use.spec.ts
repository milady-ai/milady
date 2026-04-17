import { expect, test } from "@playwright/test";
import { openAppPath, seedAppStorage } from "./helpers";

test("settings exposes computer use capability controls", async ({ page }) => {
  await seedAppStorage(page);
  await openAppPath(page, "/voice");

  await expect(page.getByTestId("settings-shell")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Computer Use" }),
  ).toBeVisible();

  await page.getByRole("switch", { name: "Enable Computer Use" }).click();

  await expect(page.getByText("Approval Mode")).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Full Control" }),
  ).toBeVisible();
  await expect(page.locator("#permissions")).toBeVisible();
  await expect(
    page.locator("#permissions").getByText("Permissions", { exact: true }),
  ).toBeVisible();
});

test("onboarding exposes the computer use feature toggle", async ({ page }) => {
  await seedAppStorage(page, {
    "eliza:onboarding-complete": "0",
    "elizaos:onboarding:force-fresh": "1",
    "eliza:onboarding:step": "features",
    "elizaos:active-server": "",
  });
  await page.route("**/api/onboarding/status", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ complete: false }),
    });
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  const onboarding = page.getByTestId("onboarding-ui-overlay");
  await expect(onboarding).toBeVisible();
  await expect(
    onboarding.getByText("Computer Use", { exact: true }),
  ).toBeVisible();
  await expect(
    onboarding.getByText(/Accessibility and Screen Recording permissions\./),
  ).toBeVisible();
  await expect(
    onboarding.getByRole("button", { name: "Continue without features" }),
  ).toBeVisible();
});
