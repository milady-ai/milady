// @milady-live-audit allow-route-fixtures
import { expect, type Page, test } from "@playwright/test";
import {
  installDefaultAppRoutes,
  openAppPath,
  openSettingsSection,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

async function openSettings(page: Page) {
  await openAppPath(page, "/settings");
  await expect(page.getByTestId("settings-shell")).toBeVisible();
}

test("Basics section exposes identity name, voice, and system prompt fields", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsSection(page, /^Basics\b/);

  const identitySection = page.locator("#identity");
  await identitySection.scrollIntoViewIfNeeded();
  await expect(identitySection).toBeVisible();

  const nameField = identitySection.locator("#settings-identity-name");
  await expect(nameField).toBeVisible();
  await nameField.fill("Smoke Tester");
  await expect(nameField).toHaveValue("Smoke Tester");

  await expect(
    identitySection.locator("#settings-identity-system-prompt"),
  ).toBeVisible();

  // Voice select wires through ThemedSelect — assert the labelled element
  // exists; clicking the menu would require account/cloud state we don't seed.
  await expect(
    identitySection.locator("#settings-identity-voice-label"),
  ).toBeVisible();
});

test("Providers section lists Eliza Cloud and Local provider entries", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsSection(page, /^Providers\b/);

  const providersSection = page.locator("#ai-model");
  await providersSection.scrollIntoViewIfNeeded();
  await expect(providersSection).toBeVisible();

  // ProviderSwitcher always renders the two top-level entries; the rail also
  // shows subscription rows. Asserting on the visible labels keeps the test
  // resilient to API-key plugin churn.
  await expect(
    providersSection.getByText("Eliza Cloud", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    providersSection.getByText("Local provider", { exact: true }).first(),
  ).toBeVisible();
});

test("Providers section connects to Eliza Cloud via the cloud sign-in flow", async ({
  page,
}) => {
  let cloudLoginPostHits = 0;
  page.on("popup", (popup) => {
    void popup.close();
  });
  await page.route("**/api/cloud/login", async (route) => {
    if (route.request().method() === "POST") {
      cloudLoginPostHits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sessionId: "smoke-cli-session",
          browserUrl:
            "https://cloud.example.test/auth/cli-login?session=smoke-cli-session",
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/api/cloud/login/status**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending" }),
      });
      return;
    }
    await route.fallback();
  });

  await openSettings(page);
  await openSettingsSection(page, /^Providers\b/);

  const providersSection = page.locator("#ai-model");
  await providersSection.scrollIntoViewIfNeeded();
  await expect(providersSection).toBeVisible();

  // Provider rail is always rendered for the cloud entry. The connect-flow
  // post is owned by the cloud panel CTA and verified via the route stub —
  // we don't assert on transient cloud-login UI states here because the live
  // stack varies between connected/disconnected fixtures.
  await expect(
    providersSection.getByText("Eliza Cloud", { exact: true }).first(),
  ).toBeVisible();

  await providersSection.getByRole("button", { name: /^Eliza Cloud,/ }).click();
  const connectButton = providersSection.getByRole("button", {
    name: /^Connect Eliza Cloud$/,
  });
  await expect(connectButton).toBeVisible();
  await connectButton.click();

  await expect.poll(() => cloudLoginPostHits, { timeout: 5_000 }).toBe(1);
});

test("Wallet & RPC section exposes the cloud-mode picker and save button", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsSection(page, /Wallet & RPC/);

  const walletSection = page.locator("#wallet-rpc");
  await walletSection.scrollIntoViewIfNeeded();
  await expect(walletSection).toBeVisible();

  await expect(walletSection.getByTestId("wallet-rpc-mode-cloud")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    walletSection.getByTestId("wallet-rpc-save").first(),
  ).toBeVisible();
});

test("Apps section shows Create / Load entry points and the verify-on-relaunch toggle", async ({
  page,
}) => {
  await openSettings(page);
  await openSettingsSection(page, /^Apps\b/);

  const appsSection = page.locator("#apps");
  await appsSection.scrollIntoViewIfNeeded();
  await expect(appsSection).toBeVisible();

  const createButton = appsSection.getByRole("button", {
    name: "Create new app",
  });
  await expect(createButton).toBeVisible();
  const loadButton = appsSection.getByRole("button", {
    name: "Load from directory",
  });
  await expect(loadButton).toBeVisible();
  const verifyOnRelaunch = appsSection.getByRole("checkbox", {
    name: "Verify on relaunch",
  });
  await expect(verifyOnRelaunch).toBeChecked();
  await verifyOnRelaunch.click();
  await expect(verifyOnRelaunch).not.toBeChecked();

  await createButton.click();
  await expect(appsSection.locator("#apps-create-intent")).toBeVisible();

  await loadButton.click();
  await expect(appsSection.locator("#apps-create-intent")).toHaveCount(0);
  await expect(appsSection.locator("#apps-load-directory")).toBeVisible();
});

test("Appearance section lets the user pick a theme mode", async ({ page }) => {
  await openSettings(page);
  await openSettingsSection(page, /^Appearance\b/);

  const appearance = page.locator("#appearance");
  await appearance.scrollIntoViewIfNeeded();
  await expect(appearance).toBeVisible();

  const lightButton = appearance.getByRole("button", { name: /^Light$/ });
  const darkButton = appearance.getByRole("button", { name: /^Dark$/ });
  await expect(lightButton).toBeVisible();
  await expect(darkButton).toBeVisible();

  await darkButton.click();
  // After clicking, the document root reflects the dark mode class — the
  // theme toggle wires through document.documentElement (Tailwind's `dark`).
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      { timeout: 5_000 },
    )
    .toBe(true);

  await lightButton.click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      { timeout: 5_000 },
    )
    .toBe(false);
});

test("Permissions section exercises browser and local website permission controls", async ({
  page,
}) => {
  let websiteBlockingRequestHits = 0;
  await page.route(
    "**/api/permissions/website-blocking/request",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      websiteBlockingRequestHits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "website-blocking",
          status: "granted",
          canRequest: false,
          lastChecked: Date.now(),
        }),
      });
    },
  );

  await openSettings(page);
  await openSettingsSection(page, /^Permissions\b/);

  const permissions = page.locator("#permissions");
  await permissions.scrollIntoViewIfNeeded();
  await expect(permissions).toBeVisible();

  await expect(
    permissions.getByRole("button", { name: "Grant Camera" }),
  ).toBeVisible();

  const websiteBlockingRequestButton = permissions.getByRole("button", {
    name: "Request Approval",
  });
  await expect(websiteBlockingRequestButton).toBeVisible();
  await websiteBlockingRequestButton.click();
  await expect
    .poll(() => websiteBlockingRequestHits, { timeout: 5_000 })
    .toBe(1);
});
