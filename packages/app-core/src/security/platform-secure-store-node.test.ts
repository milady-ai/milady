import { afterEach, describe, expect, it, vi } from "vitest";

import { isWalletOsStoreReadEnabled } from "./platform-secure-store-node";

describe("isWalletOsStoreReadEnabled", () => {
  afterEach(() => {
    delete process.env.MILADY_WALLET_OS_STORE;
  });

  it("defaults to enabled", () => {
    delete process.env.MILADY_WALLET_OS_STORE;
    expect(isWalletOsStoreReadEnabled()).toBe(true);
  });

  it.each([
    "0",
    "false",
    "off",
    "no",
    "FALSE",
    "OFF",
  ])("disables for %s", (v) => {
    process.env.MILADY_WALLET_OS_STORE = v;
    expect(isWalletOsStoreReadEnabled()).toBe(false);
  });
});
