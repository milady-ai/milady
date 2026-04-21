import { expect, test } from "@playwright/test";
import {
  installDefaultAppMocks,
  openAppPath,
  readLocalStorage,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page, { includeConfig: true });
  await seedAppStorage(page, {
    "eliza:ui-language": "en",
    "eliza:companion-vrm-power": "balanced",
    "eliza:companion-half-framerate": "when_saving_power",
    "eliza:companion-animate-when-hidden": "0",
  });
});

test("companion 3D settings persist across navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAppPath(page, "/voice");

  const vrmCard = page.getByTestId("settings-companion-vrm-power");
  const halfCard = page.getByTestId("settings-companion-half-framerate");
  const animateCard = page.getByTestId(
    "settings-companion-animate-when-hidden",
  );

  await expect(vrmCard).toBeVisible();

  await vrmCard.getByRole("button", { name: "Always efficient" }).click();
  await expect
    .poll(async () => readLocalStorage(page, "eliza:companion-vrm-power"))
    .toBe("efficiency");

  await halfCard.getByRole("button", { name: "Always half" }).click();
  await expect
    .poll(async () => readLocalStorage(page, "eliza:companion-half-framerate"))
    .toBe("always");

  const animateSwitch = animateCard.getByRole("switch");
  await animateSwitch.click();
  await expect
    .poll(async () =>
      readLocalStorage(page, "eliza:companion-animate-when-hidden"),
    )
    .toBe("1");

  await openAppPath(page, "/companion");
  await openAppPath(page, "/settings");

  const mediaNav = page
    .getByTestId("settings-sidebar")
    .getByRole("button", { name: "Media" });
  await mediaNav.click();
  await expect(vrmCard).toBeVisible();

  await expect(
    vrmCard.getByRole("button", { name: "Always efficient", pressed: true }),
  ).toBeVisible();
  await expect(
    halfCard.getByRole("button", { name: "Always half", pressed: true }),
  ).toBeVisible();
  await expect(animateSwitch).toHaveAttribute("data-state", "checked");

  await animateSwitch.click();
  await expect
    .poll(async () =>
      readLocalStorage(page, "eliza:companion-animate-when-hidden"),
    )
    .toBe("0");

  await vrmCard
    .getByRole("button", { name: "Depends on power source" })
    .first()
    .click();
  await expect
    .poll(async () => readLocalStorage(page, "eliza:companion-vrm-power"))
    .toBe("balanced");

  await halfCard
    .getByRole("button", { name: "Depends on power source" })
    .click();
  await expect
    .poll(async () => readLocalStorage(page, "eliza:companion-half-framerate"))
    .toBe("when_saving_power");
});
