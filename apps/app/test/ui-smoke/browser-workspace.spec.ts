import { expect, test } from "@playwright/test";
import { openAppPath, seedAppStorage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
});

test("browser workspace can create live tabs and switch selection", async ({
  page,
}) => {
  await openAppPath(page, "/browser");
  await expect(page).toHaveURL(/\/browser$/, { timeout: 20_000 });
  const browserWorkspaceView = page.getByTestId("browser-workspace-view");
  await expect(browserWorkspaceView).toBeVisible({
    timeout: 60_000,
  });

  const newTabButton = browserWorkspaceView.getByRole("button", {
    name: "New tab",
  });
  await expect(newTabButton).toBeVisible({ timeout: 120_000 });
  const addressInput = browserWorkspaceView.locator("input").first();
  await expect(addressInput).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("No browser tabs yet")).toBeVisible({
    timeout: 120_000,
  });

  await addressInput.fill("example.com");
  await newTabButton.click();

  const exampleTabButton = page.getByRole("tab", {
    name: /example\.com https:\/\/example\.com\//,
  });
  await expect(exampleTabButton).toBeVisible();
  await expect(addressInput).toHaveValue("https://example.com/");

  await addressInput.fill("about:blank");
  await newTabButton.click();

  const blankTabButton = page.getByRole("tab", {
    name: /about:blank/i,
  });
  await expect(blankTabButton).toBeVisible();
  await expect(addressInput).toHaveValue("about:blank");

  await exampleTabButton.click();
  await expect(addressInput).toHaveValue("https://example.com/");
});
