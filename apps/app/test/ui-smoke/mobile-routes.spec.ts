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
        const body = document.body;
        const appRoot = document.getElementById("root");
        const bottomNav = document.querySelector(
          '[data-testid="header-mobile-bottom-nav"] > div',
        );
        return [root, body, appRoot, bottomNav].every(
          (element) =>
            !element || element.scrollWidth <= element.clientWidth + 1,
        );
      }),
    )
    .toBe(true);
}

async function expectMobileViewportLocked(page: Page) {
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /maximum-scale=1\.0.*user-scalable=no/,
  );
}

test("mobile shell keeps global navigation available through phone and tablet widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAppPath(page, "/chat");

  await expectMobileViewportLocked(page);
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
