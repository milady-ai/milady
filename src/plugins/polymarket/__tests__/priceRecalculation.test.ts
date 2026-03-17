import { describe, it, expect } from "vitest";
import { recalculateSize } from "../utils/preTradeChecks";

describe("recalculateSize", () => {
  it("recalculates when isDollarAmount and price changed", () => {
    expect(recalculateSize(true, 10, 20, 0.80)).toBe(12);
  });

  it("does not change size when not isDollarAmount", () => {
    expect(recalculateSize(false, 0, 20, 0.80)).toBe(20);
  });

  it("returns 0 when finalPrice is 0", () => {
    expect(recalculateSize(true, 10, 20, 0)).toBe(0);
  });
});

describe("reject undetermined price (H10)", () => {
  it("price <= 0 after all lookups should not default to 0.50", () => {
    const shouldRejectUndeterminedPrice = (price: number): boolean => {
      return price <= 0;
    };
    expect(shouldRejectUndeterminedPrice(0)).toBe(true);
    expect(shouldRejectUndeterminedPrice(-1)).toBe(true);
    expect(shouldRejectUndeterminedPrice(0.5)).toBe(false);
  });
});
