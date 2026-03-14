import { describe, it, expect } from "vitest";
import { roundToTickSize, parseOrderBookMetadata } from "../utils/orderBook";

describe("roundToTickSize", () => {
  it("should round to 0.01 tick size", () => {
    expect(roundToTickSize(0.456, "0.01")).toBe(0.46);
    expect(roundToTickSize(0.451, "0.01")).toBe(0.45);
    expect(roundToTickSize(0.455, "0.01")).toBe(0.46);
  });

  it("should round to 0.001 tick size", () => {
    expect(roundToTickSize(0.4567, "0.001")).toBe(0.457);
    expect(roundToTickSize(0.4561, "0.001")).toBe(0.456);
  });

  it("should round to 0.0001 tick size", () => {
    expect(roundToTickSize(0.45678, "0.0001")).toBe(0.4568);
  });

  it("should default to 0.01 if tick_size is missing", () => {
    expect(roundToTickSize(0.456, undefined)).toBe(0.46);
    expect(roundToTickSize(0.456, "")).toBe(0.46);
    expect(roundToTickSize(0.456, "0")).toBe(0.46);
  });

  it("should handle edge case prices", () => {
    expect(roundToTickSize(0.99, "0.01")).toBe(0.99);
    expect(roundToTickSize(0.01, "0.01")).toBe(0.01);
    expect(roundToTickSize(0.005, "0.01")).toBe(0.01);
  });
});

describe("parseOrderBookMetadata", () => {
  it("should extract metadata from full order book response", () => {
    const raw = {
      market: "0xcond123",
      asset_id: "0xtoken456",
      bids: [{ price: "0.45", size: "100" }],
      asks: [{ price: "0.55", size: "50" }],
      tick_size: "0.001",
      min_order_size: "5",
      neg_risk: true,
      last_trade_price: "0.50",
    };
    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.001");
    expect(meta.minOrderSize).toBe("5");
    expect(meta.negRisk).toBe(true);
    expect(meta.lastTradePrice).toBe("0.50");
  });

  it("should return defaults for missing fields", () => {
    const raw = {
      market: "0xcond",
      asset_id: "0xtoken",
      bids: [],
      asks: [],
    };
    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.01");
    expect(meta.minOrderSize).toBe("1");
    expect(meta.negRisk).toBe(false);
    expect(meta.lastTradePrice).toBeNull();
  });
});
