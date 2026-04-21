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
  const chatSidebar = browserWorkspaceView.getByTestId(
    "browser-workspace-view-chat-sidebar",
  );
  await expect(chatSidebar).toBeVisible({ timeout: 120_000 });
  const chatSidebarBox = await chatSidebar.boundingBox();
  const addressInputBox = await addressInput.boundingBox();
  if (!chatSidebarBox || !addressInputBox) {
    throw new Error("Browser workspace layout elements did not render boxes.");
  }
  expect(chatSidebarBox.y).toBeLessThan(addressInputBox.y);
  await expect(page.getByText("No browser tabs yet")).toBeVisible({
    timeout: 120_000,
  });

  await addressInput.fill("example.com");
  await newTabButton.click();

  const exampleTabButton = browserWorkspaceView.locator(
    '[role="tab"][title="https://example.com/"]',
  );
  await expect(exampleTabButton).toBeVisible();
  await expect(exampleTabButton).toContainText("example.com");
  await expect(exampleTabButton).toHaveAttribute(
    "title",
    "https://example.com/",
  );
  await expect(addressInput).toHaveValue("https://example.com/");

  await addressInput.fill("about:blank");
  await newTabButton.click();

  const blankTabButton = browserWorkspaceView.locator(
    '[role="tab"][title="about:blank"]',
  );
  await expect(blankTabButton).toBeVisible();
  await expect(blankTabButton).toHaveAttribute("title", "about:blank");
  await expect(addressInput).toHaveValue("about:blank");

  await exampleTabButton.click();
  await expect(addressInput).toHaveValue("https://example.com/");
});
