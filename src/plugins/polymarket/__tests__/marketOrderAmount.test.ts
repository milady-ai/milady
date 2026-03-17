import { describe, it, expect } from "vitest";
import { computeMarketOrderAmount } from "../utils/preTradeChecks";

describe("computeMarketOrderAmount", () => {
  it("BUY + user specified dollars: amount = dollarAmount", () => {
    expect(computeMarketOrderAmount("BUY", 0.5, 20, 10, true)).toBe(10);
  });

  it("BUY + user specified shares: amount = price * size", () => {
    expect(computeMarketOrderAmount("BUY", 0.5, 20, 0, false)).toBe(10);
  });

  it("SELL + user specified shares: amount = size", () => {
    expect(computeMarketOrderAmount("SELL", 0.5, 20, 0, false)).toBe(20);
  });

  it("SELL + user specified dollars: amount = floor(dollarAmount / price) = shares", () => {
    expect(computeMarketOrderAmount("SELL", 0.5, 0, 10, true)).toBe(20);
  });

  it("BUY at low price: avoids the 10x over-buy bug", () => {
    // Old bug: amount=20 (shares) at $0.10 = API reads $20, buys 200 shares
    // Fixed: amount=20*0.10=2 (dollars) at $0.10 = API buys 20 shares
    expect(computeMarketOrderAmount("BUY", 0.10, 20, 0, false)).toBeCloseTo(2.0);
  });
});
