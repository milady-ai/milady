import { afterEach, describe, expect, it, vi } from "vitest";

import { isWalletOsStoreReadEnabled } from "./platform-secure-store-node";

describe("isWalletOsStoreReadEnabled", () => {
  afterEach(() => {
    delete process.env.MILADY_WALLET_OS_STORE;
  });

  it("defaults to disabled when unset", () => {
    delete process.env.MILADY_WALLET_OS_STORE;
    expect(isWalletOsStoreReadEnabled()).toBe(false);
  });

  it.each(["1", "true", "on", "yes", "TRUE", "ON"])("enables for %s", (v) => {
    process.env.MILADY_WALLET_OS_STORE = v;
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

  it("disables for unknown tokens (fail closed)", () => {
    process.env.MILADY_WALLET_OS_STORE = "maybe";
    expect(isWalletOsStoreReadEnabled()).toBe(false);
  });
});
