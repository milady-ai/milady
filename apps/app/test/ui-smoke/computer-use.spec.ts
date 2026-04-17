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

test("onboarding exposes computer use feature and permissions step", async ({
  page,
}) => {
  await seedAppStorage(page, {
    "elizaos:onboarding:force-fresh": "1",
    "eliza:onboarding:step": "features",
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  const onboarding = page.getByTestId("onboarding-ui-overlay");
  await expect(onboarding).toBeVisible();
  await expect(
    onboarding.getByText("Computer Use", { exact: true }),
  ).toBeVisible();

  const featureCard = onboarding
    .locator("div")
    .filter({ has: onboarding.getByText("Computer Use", { exact: true }) })
    .first();

  await featureCard.getByRole("button", { name: "Enable" }).click();
  await expect(
    featureCard.getByRole("button", { name: "Disable" }),
  ).toBeVisible();

  await onboarding.getByRole("button", { name: "Continue" }).click();

  await expect(
    onboarding.getByText("System Permissions", { exact: true }),
  ).toBeVisible();
  await expect(
    onboarding.getByText("Computer Use", { exact: true }),
  ).toBeVisible();
});
