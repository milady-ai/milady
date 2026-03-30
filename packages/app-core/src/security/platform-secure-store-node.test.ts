import { afterEach, describe, expect, it } from "vitest";

import { isWalletOsStoreReadEnabled } from "./platform-secure-store-node";

describe("isWalletOsStoreReadEnabled", () => {
  afterEach(() => {
    delete process.env.MILADY_WALLET_OS_STORE;
  });

  it("defaults to disabled (opt-in)", () => {
    delete process.env.MILADY_WALLET_OS_STORE;
    expect(isWalletOsStoreReadEnabled()).toBe(false);
  });

  it.each([
    "1",
    "true",
    "on",
    "yes",
    "TRUE",
    "ON",
    "YES",
  ])("enables for %s", (v) => {
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
    "",
    "unknown",
  ])("stays disabled for %s", (v) => {
    process.env.MILADY_WALLET_OS_STORE = v;
    expect(isWalletOsStoreReadEnabled()).toBe(false);
  });
});
