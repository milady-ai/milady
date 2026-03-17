import { describe, it, expect } from "vitest";
import { parseOrderBookMetadata, type OrderBookMeta } from "../utils/orderBook";

describe("parseOrderBookMetadata", () => {
  it("extracts tick_size and neg_risk from order book response", () => {
    const raw = {
      bids: [],
      asks: [],
      tick_size: "0.001",
      min_order_size: "5",
      neg_risk: true,
      last_trade_price: "0.45",
    };
    const meta = parseOrderBookMetadata(raw);
    expect(meta.tickSize).toBe("0.001");
    expect(meta.negRisk).toBe(true);
    expect(meta.minOrderSize).toBe("5");
  });

  it("defaults tick_size to 0.01 when missing", () => {
    const meta = parseOrderBookMetadata({});
    expect(meta.tickSize).toBe("0.01");
    expect(meta.negRisk).toBe(false);
  });
});

describe("SDK options construction", () => {
  it("builds CreateOrderOptions from OrderBookMeta", () => {
    const meta: OrderBookMeta = {
      tickSize: "0.001",
      minOrderSize: "5",
      negRisk: true,
      lastTradePrice: "0.45",
    };
    const options = {
      tickSize: meta.tickSize as "0.1" | "0.01" | "0.001" | "0.0001",
      negRisk: meta.negRisk,
    };
    expect(options.tickSize).toBe("0.001");
    expect(options.negRisk).toBe(true);
  });
});
