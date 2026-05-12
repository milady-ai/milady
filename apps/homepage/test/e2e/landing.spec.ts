import { expect, test } from "@playwright/test";
import { mockCloudApi } from "./fixtures/cloud-auth";

test.describe("homepage - landing page", () => {
  test("renders the minimal platform landing surface", async ({ page }) => {
    await mockCloudApi(page.context(), { agents: [] });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /AGENTS THAT/i }),
    ).toBeVisible();
    for (const label of ["MAC", "PC", "LINUX", "WEB", "ANDROID"]) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Open Milady in the cloud" }),
    ).toBeVisible();
    await expect(page.getByText("attach remote")).toHaveCount(0);
    await expect(page.locator("aside")).toHaveCount(0);
  });
});
