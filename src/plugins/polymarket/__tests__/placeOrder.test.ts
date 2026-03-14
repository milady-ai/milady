import { describe, it, expect } from "vitest";
import { roundToTickSize } from "../utils/orderBook";

describe("placeOrder tick size handling", () => {
  it("should preserve 3-decimal precision for 0.001 tick markets", () => {
    expect(roundToTickSize(0.456, "0.001")).toBe(0.456);
  });

  it("should preserve 4-decimal precision for 0.0001 tick markets", () => {
    expect(roundToTickSize(0.4567, "0.0001")).toBe(0.4567);
  });

  it("should still round 2-decimal for 0.01 tick markets", () => {
    expect(roundToTickSize(0.456, "0.01")).toBe(0.46);
  });

  it("should handle percentage-to-decimal conversion before rounding", () => {
    const price = 45 / 100;
    expect(roundToTickSize(price, "0.01")).toBe(0.45);
  });
});
