import { describe, it, expect } from "vitest";
import { getBalanceAction } from "../actions/getBalance";

describe("getBalanceAction", () => {
  it("should have correct action name", () => {
    expect(getBalanceAction.name).toBe("POLYMARKET_GET_BALANCE");
  });

  it("should have balance-related similes", () => {
    expect(getBalanceAction.similes).toContain("POLYMARKET_CHECK_BALANCE");
    expect(getBalanceAction.similes).toContain("POLYMARKET_USDC_BALANCE");
  });

  it("should require API credentials", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getBalanceAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });

  it("should pass validate with private key alone (CLOB creds auto-derived)", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === "POLYMARKET_PRIVATE_KEY") return "0xdeadbeef";
        return undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getBalanceAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(true); // Private key is sufficient; CLOB creds are auto-derived
  });

  it("should pass validate with all credentials", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        const settings: Record<string, string> = {
          POLYMARKET_PRIVATE_KEY: "0xdeadbeef",
          CLOB_API_KEY: "key",
          CLOB_API_SECRET: "secret",
          CLOB_API_PASSPHRASE: "passphrase",
        };
        return settings[key] ?? undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getBalanceAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(true);
  });
});
