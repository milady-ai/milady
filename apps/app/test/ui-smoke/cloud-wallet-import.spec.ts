import { expect, test } from "@playwright/test";
import { openAppPath, seedAppStorage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await seedAppStorage(page);
});

test("inventory cloud import uses the live wallet API", async ({ page }) => {
  let walletConfigGetCount = 0;
  let refreshCloudCount = 0;

  page.on("request", (request) => {
    const url = request.url();
    if (request.method() === "GET" && url.endsWith("/api/wallet/config")) {
      walletConfigGetCount += 1;
    }
    if (
      request.method() === "POST" &&
      url.endsWith("/api/wallet/refresh-cloud")
    ) {
      refreshCloudCount += 1;
    }
  });

  await openAppPath(page, "/inventory");

  const cloudStatusResponse = await page.request.get("/api/cloud/status");
  expect(cloudStatusResponse.ok()).toBe(true);
  const cloudStatus = (await cloudStatusResponse.json()) as {
    connected?: boolean;
    hasApiKey?: boolean;
  };
  test.skip(
    !(cloudStatus.connected === true || cloudStatus.hasApiKey === true),
    "Eliza Cloud is not linked in this live stack.",
  );

  await expect
    .poll(() => walletConfigGetCount, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);

  const importBtn = page.getByRole("button", {
    name: "Import from Eliza Cloud",
  });
  await expect(importBtn).toBeVisible({ timeout: 15_000 });
  await importBtn.click();

  const saveBtn = page.getByRole("button", { name: /^Save$/ }).last();
  await expect(saveBtn).toBeVisible({ timeout: 15_000 });

  const walletConfigPutRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      request.url().endsWith("/api/wallet/config"),
    { timeout: 15_000 },
  );
  const walletConfigPutResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/api/wallet/config"),
    { timeout: 15_000 },
  );
  const refreshCloudResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/wallet/refresh-cloud"),
    { timeout: 15_000 },
  );

  await saveBtn.click();

  const walletConfigPutRequest = await walletConfigPutRequestPromise;
  const walletConfigPutResponse = await walletConfigPutResponsePromise;
  const refreshCloudResponse = await refreshCloudResponsePromise;

  expect(walletConfigPutResponse.status()).toBe(200);
  expect(refreshCloudResponse.status()).toBe(200);

  const putPayload = walletConfigPutRequest.postDataJSON() as {
    selections?: Record<string, string>;
    walletNetwork?: string;
  };
  expect(putPayload.selections).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });
  expect(putPayload.walletNetwork).toBe("mainnet");

  await expect
    .poll(() => refreshCloudCount, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => walletConfigGetCount, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);

  const walletConfigResponse = await page.request.get("/api/wallet/config");
  expect(walletConfigResponse.ok()).toBe(true);
  const walletConfig = (await walletConfigResponse.json()) as {
    selectedRpcProviders?: Record<string, string>;
  };
  expect(walletConfig.selectedRpcProviders).toEqual({
    evm: "eliza-cloud",
    bsc: "eliza-cloud",
    solana: "eliza-cloud",
  });
});
