import { describe, it, expect } from "vitest";
import type { OrderResponse } from "../types";

describe("OrderResponse type", () => {
  it("should accept actual CLOB API response shape (live order)", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890abcdef1234567890abcdef12",
      status: "live",
      makingAmount: "100000000",
      takingAmount: "200000000",
      errorMsg: "",
    };
    expect(response.success).toBe(true);
    expect(response.orderID).toBeDefined();
    expect(response.status).toBe("live");
  });

  it("should accept matched order with transaction hashes", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890",
      status: "matched",
      makingAmount: "100000000",
      takingAmount: "200000000",
      transactionsHashes: ["0x1234567890abcdef"],
      tradeIDs: ["trade-123"],
      errorMsg: "",
    };
    expect(response.transactionsHashes).toHaveLength(1);
    expect(response.tradeIDs).toHaveLength(1);
  });

  it("should accept delayed order", () => {
    const response: OrderResponse = {
      success: true,
      orderID: "0xabcdef1234567890",
      status: "delayed",
      errorMsg: "",
    };
    expect(response.status).toBe("delayed");
  });

  it("should accept error response", () => {
    const response: OrderResponse = {
      success: false,
      errorMsg: "Invalid order payload",
    };
    expect(response.success).toBe(false);
  });
});
