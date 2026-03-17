import { describe, it, expect } from "vitest";
import { getTradeHistoryAction } from "../actions/getTradeHistory";

describe("getTradeHistoryAction", () => {
  it("should have correct action name", () => {
    expect(getTradeHistoryAction.name).toBe("POLYMARKET_GET_TRADE_HISTORY");
  });

  it("should have trade-related similes", () => {
    expect(getTradeHistoryAction.similes).toContain("POLYMARKET_MY_TRADES");
    expect(getTradeHistoryAction.similes).toContain("POLYMARKET_TRADE_LOG");
  });

  it("should require a private key", async () => {
    const mockRuntime = {
      getSetting: () => undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getTradeHistoryAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(false);
  });

  it("should pass validate with private key", async () => {
    const mockRuntime = {
      getSetting: (key: string) => {
        if (key === "POLYMARKET_PRIVATE_KEY") return "0xdeadbeef";
        return undefined;
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await getTradeHistoryAction.validate(mockRuntime as any, {} as any);
    expect(result).toBe(true);
  });
});
