import { describe, it, expect } from "vitest";
import {
  validateOrderBounds,
  validateMinOrderSize,
  validateBalance,
} from "../utils/preTradeChecks";

describe("validateOrderBounds (H3)", () => {
  it("rejects size > MAX_TRADE_SIZE_USD / price", () => {
    const result = validateOrderBounds({ price: 0.5, size: 300, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("exceeds");
  });

  it("accepts size within bounds", () => {
    const result = validateOrderBounds({ price: 0.5, size: 100, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(true);
  });

  it("rejects price outside 0-1 range", () => {
    const result = validateOrderBounds({ price: 1.5, size: 10, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
  });

  it("rejects price of exactly 0", () => {
    const result = validateOrderBounds({ price: 0, size: 10, maxTradeSizeUsd: 100 });
    expect(result.valid).toBe(false);
  });
});

describe("validateMinOrderSize (H8)", () => {
  it("rejects size below min_order_size", () => {
    const result = validateMinOrderSize(3, "5");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("minimum");
  });

  it("accepts size at min_order_size", () => {
    const result = validateMinOrderSize(5, "5");
    expect(result.valid).toBe(true);
  });

  it("handles unparseable min_order_size gracefully", () => {
    const result = validateMinOrderSize(1, "");
    expect(result.valid).toBe(true);
  });
});

describe("validateBalance (H1)", () => {
  it("rejects when balance < order cost", () => {
    const result = validateBalance(5, 20);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Insufficient");
  });

  it("accepts when balance >= order cost", () => {
    const result = validateBalance(100, 20);
    expect(result.valid).toBe(true);
  });

  it("accepts when balance is null (skip check)", () => {
    const result = validateBalance(null, 20);
    expect(result.valid).toBe(true);
  });
});
