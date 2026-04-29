import { expect, type Page, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= window.innerWidth + 1;
      }),
    )
    .toBe(true);
}

test("mobile shell keeps global navigation available through phone and tablet widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppPath(page, "/chat");

  await expect(page.getByTestId("header-mobile-bottom-nav")).toBeVisible();
  await expect(
    page.getByTestId("header-mobile-bottom-nav-button-chat"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByTestId("header-mobile-bottom-nav-button-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("settings-shell")).toBeVisible();
  await expect(page.getByTestId("settings-workspace")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByTestId("header-mobile-bottom-nav")).toBeVisible();
  await expect(
    page.getByTestId("header-mobile-bottom-nav-button-chat"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 800, height: 900 });
  await openAppPath(page, "/browser");
  await expect(page.getByTestId("header-mobile-bottom-nav")).toBeVisible();
  await expect(page.getByTestId("browser-workspace-view")).toBeVisible();
  await expect(
    page.getByTestId("app-workspace-mobile-pane-switcher"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
