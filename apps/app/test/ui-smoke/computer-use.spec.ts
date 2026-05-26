import { expect, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  openSettingsSection,
  seedAppStorage,
} from "./helpers";

test("settings exposes computer use capability controls", async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
  await openAppPath(page, "/voice");

  await expect(page.getByTestId("settings-shell")).toBeVisible();
  await openSettingsSection(page, /^Capabilities\b/);

  await expect(page.locator("#capabilities")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Computer Use" }),
  ).toBeVisible();

  await page.getByRole("switch", { name: "Enable Computer Use" }).click();

  await expect(
    page.getByText(/Computer Use requires Accessibility and Screen Recording/),
  ).toBeVisible();
  await expect(page.locator("#permissions")).toBeVisible();
  await expect(
    page.locator("#permissions").getByText("Permissions", { exact: true }),
  ).toBeVisible();
});

test("first-run starts with setup choices before capability settings", async ({
  page,
}) => {
  await seedAppStorage(page, {
    "eliza:first-run-complete": "0",
    "elizaos:first-run:force-fresh": "1",
    "eliza:setup:step": "capabilities",
    "elizaos:active-server": "",
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Choose your setup" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Eliza Cloud/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Remote agent/ }),
  ).toBeVisible();
});
