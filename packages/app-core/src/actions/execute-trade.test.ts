import { describe, expect, it, vi } from "vitest";
import { executeTradeAction } from "./execute-trade.js";

// Mock @elizaos/core logger
vi.mock("@elizaos/core", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock wallet-action-shared so we don't need real env vars
vi.mock("./wallet-action-shared.js", () => ({
  getWalletActionApiPort: () => "31337",
  buildAuthHeaders: () => ({}),
}));

describe("executeTradeAction", () => {
  describe("validate", () => {
    it("returns false when no wallet is configured", async () => {
      const runtime = {
        getSetting: () => undefined,
      };
      expect(await executeTradeAction.validate(runtime as never)).toBe(false);
    });

    it("returns true when EVM_PRIVATE_KEY is set", async () => {
      const runtime = {
        getSetting: (key: string) =>
          key === "EVM_PRIVATE_KEY" ? "0xdeadbeef" : undefined,
      };
      expect(await executeTradeAction.validate(runtime as never)).toBe(true);
    });

    it("returns true when PRIVY_APP_ID is set", async () => {
      const runtime = {
        getSetting: (key: string) =>
          key === "PRIVY_APP_ID" ? "app_123" : undefined,
      };
      expect(await executeTradeAction.validate(runtime as never)).toBe(true);
    });

    it("returns true when STEWARD_API_URL is set", async () => {
      const runtime = {
        getSetting: (key: string) =>
          key === "STEWARD_API_URL" ? "https://steward.example.com" : undefined,
      };
      expect(await executeTradeAction.validate(runtime as never)).toBe(true);
    });
  });

  describe("handler validation", () => {
    const callHandler = async (params: Record<string, unknown>) => {
      const results: Array<{ text: string }> = [];
      await executeTradeAction.handler(
        {} as never,
        {} as never,
        undefined,
        { parameters: params },
        (result) => {
          results.push(result as { text: string });
        },
      );
      return results;
    };

    it("rejects missing side", async () => {
      const results = await callHandler({
        tokenAddress: "0x" + "a".repeat(40),
        amount: "1",
      });
      expect(results[0].text).toContain("valid trade side");
    });

    it("rejects invalid side", async () => {
      const results = await callHandler({
        side: "hodl",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "1",
      });
      expect(results[0].text).toContain("valid trade side");
    });

    it("rejects missing tokenAddress", async () => {
      const results = await callHandler({ side: "buy", amount: "1" });
      expect(results[0].text).toContain("valid BSC token contract address");
    });

    it("rejects short tokenAddress", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0xabc",
        amount: "1",
      });
      expect(results[0].text).toContain("valid BSC token contract address");
    });

    it("rejects non-hex tokenAddress", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "g".repeat(40),
        amount: "1",
      });
      expect(results[0].text).toContain("valid BSC token contract address");
    });

    it("rejects missing amount", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "a".repeat(40),
      });
      expect(results[0].text).toContain("positive numeric amount");
    });

    it("rejects zero amount", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "0",
      });
      expect(results[0].text).toContain("positive numeric amount");
    });

    it("rejects negative amount", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "-5",
      });
      expect(results[0].text).toContain("positive numeric amount");
    });

    it("rejects NaN amount", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "not-a-number",
      });
      expect(results[0].text).toContain("positive numeric amount");
    });

    it("rejects negative slippageBps", async () => {
      const results = await callHandler({
        side: "buy",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "1",
        slippageBps: -100,
      });
      expect(results[0].text).toContain("slippageBps");
    });

    it("rejects placeholder values like 'unknown'", async () => {
      const results = await callHandler({
        side: "unknown",
        tokenAddress: "0x" + "a".repeat(40),
        amount: "1",
      });
      expect(results[0].text).toContain("valid trade side");
    });
  });
});
