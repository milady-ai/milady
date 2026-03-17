import { describe, it, expect } from "vitest";
import {
  PlaceOrderParamsSchema,
  CancelOrderParamsSchema,
  ClosePositionParamsSchema,
} from "../utils/llmSchemas";

describe("PlaceOrderParamsSchema", () => {
  it("accepts valid order with dollarAmount", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123abc",
      side: "buy",
      price: 0.5,
      dollarAmount: 10,
      outcome: "yes",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dollarAmount).toBe(10);
      expect(result.data.side).toBe("buy");
    }
  });

  it("accepts valid order with shares", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "123456",
      side: "sell",
      shares: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts MARKET_NAME_LOOKUP with marketName", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "MARKET_NAME_LOOKUP",
      marketName: "Miami Heat",
      side: "buy",
      dollarAmount: 5,
      outcome: "yes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects string price like 'fifty cents'", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      price: "fifty cents",
      dollarAmount: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative dollarAmount", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      dollarAmount: -5,
    });
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings to numbers", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      tokenId: "0x123",
      side: "buy",
      price: "0.50",
      dollarAmount: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(0.5);
      expect(result.data.dollarAmount).toBe(10);
    }
  });

  it("returns error object for LLM error response", () => {
    const result = PlaceOrderParamsSchema.safeParse({
      error: "No order intent detected.",
    });
    expect(result.success).toBe(true);
  });
});

describe("CancelOrderParamsSchema", () => {
  it("accepts cancelAll", () => {
    const result = CancelOrderParamsSchema.safeParse({ cancelAll: true });
    expect(result.success).toBe(true);
  });

  it("accepts orderIds array", () => {
    const result = CancelOrderParamsSchema.safeParse({ orderIds: ["abc", "def"] });
    expect(result.success).toBe(true);
  });

  it("rejects non-string orderIds", () => {
    const result = CancelOrderParamsSchema.safeParse({ orderIds: [123, 456] });
    expect(result.success).toBe(false);
  });
});

describe("ClosePositionParamsSchema", () => {
  it("accepts tokenId", () => {
    const result = ClosePositionParamsSchema.safeParse({ tokenId: "0x123abc" });
    expect(result.success).toBe(true);
  });

  it("accepts marketName", () => {
    const result = ClosePositionParamsSchema.safeParse({ marketName: "Bitcoin 100k" });
    expect(result.success).toBe(true);
  });

  it("rejects numeric tokenId", () => {
    const result = ClosePositionParamsSchema.safeParse({ tokenId: 12345 });
    expect(result.success).toBe(false);
  });
});
