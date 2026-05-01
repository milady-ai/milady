import { expect, type Page, test } from "@playwright/test";
import {
  installCloudWalletImportApiOverrides,
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

async function openWalletRpcSettings(page: Page) {
  await page.getByRole("button", { name: "Open RPC settings" }).click();
  await expect(page.getByTestId("wallet-rpc-mode-cloud")).toBeVisible({
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

test("inventory cloud import saves cloud RPC selections and refreshes cloud wallets", async ({
  page,
}) => {
  await installDefaultAppRoutes(page);
  const api = await installCloudWalletImportApiOverrides(page);

  await openAppPath(page, "/inventory");

  await openWalletRpcSettings(page);

  const saveBtn = page.getByTestId("wallet-rpc-save");
  await expect(saveBtn).toBeVisible({ timeout: 15_000 });
  await saveBtn.click();

  await expect
    .poll(() => api.lastWalletConfigPut(), { timeout: 15_000 })
    .not.toBeNull();

  const put = api.lastWalletConfigPut() as {
    selections?: Record<string, string>;
    walletNetwork?: string;
  };
  expect(put.selections).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });
  expect(put.walletNetwork).toBe("mainnet");

  await expect
    .poll(() => api.refreshCloudRequestCount(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => api.walletConfigGetCount(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  expect(api.walletConfig().selectedRpcProviders).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });
});

test("inventory wallet RPC dialog exposes the Custom RPC mode picker", async ({
  page,
}) => {
  await installDefaultAppRoutes(page);
  await installCloudWalletImportApiOverrides(page);

  await openAppPath(page, "/inventory");
  await openWalletRpcSettings(page);

  const cloudButton = page.getByTestId("wallet-rpc-mode-cloud");
  await expect(cloudButton).toBeVisible();

  const customButton = page.getByRole("button", { name: /Custom RPC/ });
  await expect(customButton).toBeVisible();

  await customButton.click();
  // Switching to custom mode swaps the rendered fields — the per-chain
  // section header text is the stable signal that the custom panel mounted.
  await expect(page.getByText("Custom RPC Providers")).toBeVisible({
    timeout: 10_000,
  });

  // Switching back to cloud restores the cloud-mode picker.
  await cloudButton.click();
  await expect(page.getByText("Custom RPC Providers")).toHaveCount(0);
});

test("settings → Wallet & RPC route exposes the same cloud save flow", async ({
  page,
}) => {
  await installDefaultAppRoutes(page);
  const api = await installCloudWalletImportApiOverrides(page);

  await openAppPath(page, "/settings");
  const walletNav = page
    .getByRole("navigation", { name: "Settings" })
    .getByRole("button", { name: /Wallet & RPC/ });
  await walletNav.click();

  const walletSection = page.locator("#wallet-rpc");
  await walletSection.scrollIntoViewIfNeeded();
  await expect(walletSection.getByTestId("wallet-rpc-mode-cloud")).toBeVisible({
    timeout: 15_000,
  });

  const saveBtn = walletSection.getByTestId("wallet-rpc-save").first();
  await expect(saveBtn).toBeVisible({ timeout: 15_000 });
  await saveBtn.click();

  await expect
    .poll(() => api.lastWalletConfigPut(), { timeout: 15_000 })
    .not.toBeNull();

  const put = api.lastWalletConfigPut() as {
    selections?: Record<string, string>;
  };
  expect(put.selections).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });

  await expect
    .poll(() => api.refreshCloudRequestCount(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
});
