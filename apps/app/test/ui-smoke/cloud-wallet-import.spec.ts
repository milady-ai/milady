import { expect, test } from "@playwright/test";
import {
  installCloudWalletImportApiOverrides,
  installDefaultAppRoutes,
  openAppPath,
  seedAppStorage,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
  await installDefaultAppRoutes(page);
});

test("inventory Import from Eliza Cloud sends eliza-cloud RPC and hits steward-status", async ({
  page,
}) => {
  const api = await installCloudWalletImportApiOverrides(page);

  await openAppPath(page, "/inventory");

  const importBtn = page.getByRole("button", {
    name: "Import from Eliza Cloud",
  });
  await expect(importBtn).toBeVisible({ timeout: 15_000 });
  await importBtn.click();

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

  // steward-status is fetched at least twice:
  //   1. On mount — WalletView polls /api/wallet/steward-status to show connection state.
  //   2. After "Import from Eliza Cloud" save — the wallet-config PUT triggers a
  //      re-fetch so the UI reflects the newly-provisioned Steward bridge.
  // ≥2 (not exactly 2) because React strict-mode double-mounts in dev add an
  // extra call, and future UI additions may add more legitimate fetches.
  await expect
    .poll(() => api.stewardStatusRequestCount(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
});
