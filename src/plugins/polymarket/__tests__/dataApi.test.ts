import { describe, it, expect, vi } from "vitest";
import { fetchUserPositions, fetchUserTotalValue } from "../utils/dataApi";

function createMockRuntime(responseData: unknown, ok = true) {
  return {
    fetch: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as Parameters<typeof fetchUserPositions>[0];
}

describe("fetchUserPositions", () => {
  it("should fetch positions from Data API", async () => {
    const mockPositions = [
      {
        proxyWallet: "0xabc",
        asset: "token123",
        conditionId: "0xcond",
        size: 100,
        avgPrice: 0.45,
        currentValue: 50,
        cashPnl: 5,
        title: "Will BTC hit 100k?",
        outcome: "Yes",
        outcomeIndex: 0,
      },
    ];
    const runtime = createMockRuntime(mockPositions);
    const positions = await fetchUserPositions(runtime, "0xuser123");
    expect(positions).toHaveLength(1);
    expect(positions[0].title).toBe("Will BTC hit 100k?");
    expect(runtime.fetch).toHaveBeenCalledWith(
      expect.stringContaining("data-api.polymarket.com/positions?user=0xuser123")
    );
  });

  it("should return empty array on API failure", async () => {
    const runtime = createMockRuntime({ error: "not found" }, false);
    const positions = await fetchUserPositions(runtime, "0xbad");
    expect(positions).toEqual([]);
  });

  it("should filter out zero-size positions", async () => {
    const mockPositions = [
      { size: 100, asset: "a", conditionId: "0x1", outcome: "Yes" },
      { size: 0, asset: "b", conditionId: "0x2", outcome: "No" },
    ];
    const runtime = createMockRuntime(mockPositions);
    const positions = await fetchUserPositions(runtime, "0xuser");
    expect(positions).toHaveLength(1);
    expect(positions[0].asset).toBe("a");
  });
});

describe("fetchUserTotalValue", () => {
  it("should fetch total value from Data API", async () => {
    const runtime = createMockRuntime({ total_value: "1234.56" });
    const value = await fetchUserTotalValue(runtime, "0xuser");
    expect(value).toBe(1234.56);
  });

  it("should return 0 on failure", async () => {
    const runtime = createMockRuntime({}, false);
    const value = await fetchUserTotalValue(runtime, "0xuser");
    expect(value).toBe(0);
  });
});
