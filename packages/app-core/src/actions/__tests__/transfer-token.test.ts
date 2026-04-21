/**
 * Tests for transfer-token action — steward signing path and direct signing fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transferTokenAction } from "../transfer-token";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock("../wallet-action-shared.js", () => ({
  getWalletActionApiPort: () => "31337",
  buildAuthHeaders: () => ({}),
}));

const mockFetch = vi.fn();

const ORIGINAL_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "STEWARD_API_URL",
  "STEWARD_AGENT_ID",
  "MILADY_STEWARD_AGENT_ID",
  "ELIZA_STEWARD_AGENT_ID",
  "MILADY_WALLET_NETWORK",
] as const;

const VALID_MESSAGE = {
  content: {
    text: "send 1 BNB to 0x000000000000000000000000000000000000dead",
  },
};

const VALID_PARAMS = {
  toAddress: "0x000000000000000000000000000000000000dead",
  amount: "1",
  assetSymbol: "BNB",
};

function mockRuntime(settings: Record<string, string> = {}) {
  return {
    getSetting: (key: string) => settings[key] || null,
  } as any;
}

describe("transfer-token action", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    for (const key of ENV_KEYS) {
      ORIGINAL_ENV[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      if (ORIGINAL_ENV[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = ORIGINAL_ENV[key];
      }
    }
  });

  describe("validate", () => {
    it("returns true when STEWARD_API_URL is configured", async () => {
      const runtime = mockRuntime({
        STEWARD_API_URL: "https://steward.example",
      });
      const result = await transferTokenAction.validate!(runtime, {} as any);
      expect(result).toBe(true);
    });

    it("returns true when EVM_PRIVATE_KEY is configured", async () => {
      const runtime = mockRuntime({ EVM_PRIVATE_KEY: "0xpk" });
      const result = await transferTokenAction.validate!(runtime, {} as any);
      expect(result).toBe(true);
    });

    it("returns false when no wallet source is configured", async () => {
      const runtime = mockRuntime();
      const result = await transferTokenAction.validate!(runtime, {} as any);
      expect(result).toBe(false);
    });
  });

  describe("steward signing path", () => {
    beforeEach(() => {
      process.env.STEWARD_API_URL = "https://steward.example";
      process.env.STEWARD_AGENT_ID = "agent-1";
    });

    it("handles approved response (steward signed and broadcast)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ approved: true, txHash: "0xhash123" }),
      });

      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        VALID_MESSAGE as any,
        undefined,
        { parameters: VALID_PARAMS } as any,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TRANSFER_TOKEN_SUCCESS",
          txHash: "0xhash123",
          executionMode: "steward",
          executed: true,
        }),
      );
      expect((result as any).success).toBe(true);
      expect((result as any).data.mode).toBe("steward");
    });

    it("handles pending response (needs manual approval)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 202,
        json: async () => ({ pending: true, txId: "tx-queue-1" }),
      });

      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        VALID_MESSAGE as any,
        undefined,
        { parameters: VALID_PARAMS } as any,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TRANSFER_TOKEN_PENDING",
          executionMode: "steward",
          executed: false,
          txId: "tx-queue-1",
        }),
      );
      expect((result as any).success).toBe(false);
      expect((result as any).data.pending).toBe(true);
    });

    it("handles denied response (policy violation)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          violations: [{ policy: "daily-limit", reason: "Exceeds $500 daily" }],
        }),
      });

      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        VALID_MESSAGE as any,
        undefined,
        { parameters: VALID_PARAMS } as any,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TRANSFER_TOKEN_FAILED",
          executionMode: "steward",
          executed: false,
          violations: [{ policy: "daily-limit", reason: "Exceeds $500 daily" }],
        }),
      );
      expect((result as any).success).toBe(false);
      expect((result as any).data.denied).toBe(true);
    });

    it("falls through to direct signing on steward error", async () => {
      // Steward call fails with network error
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      // Direct signing fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          mode: "server",
          executed: true,
          requiresUserSignature: false,
          toAddress: "0x000000000000000000000000000000000000dead",
          amount: "1",
          assetSymbol: "BNB",
          execution: {
            hash: "0xdirect_hash",
            explorerUrl: "https://bscscan.com/tx/0xdirect_hash",
            status: "success",
            blockNumber: 12345,
          },
        }),
      });

      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        VALID_MESSAGE as any,
        undefined,
        { parameters: VALID_PARAMS } as any,
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "TRANSFER_TOKEN_SUCCESS",
          txHash: "0xdirect_hash",
          executed: true,
        }),
      );
      expect((result as any).success).toBe(true);
    });
  });

  describe("direct signing path (steward not configured)", () => {
    it("routes through direct execution API when steward is not configured", async () => {
      // No STEWARD_API_URL set
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          mode: "server",
          executed: true,
          requiresUserSignature: false,
          toAddress: "0x000000000000000000000000000000000000dead",
          amount: "1",
          assetSymbol: "BNB",
          execution: {
            hash: "0xdirect_only",
            explorerUrl: "https://bscscan.com/tx/0xdirect_only",
            status: "success",
            blockNumber: 100,
          },
        }),
      });

      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        VALID_MESSAGE as any,
        undefined,
        { parameters: VALID_PARAMS } as any,
        callback,
      );

      expect((result as any).success).toBe(true);
      expect((result as any).data.txHash).toBe("0xdirect_only");

      // Verify the fetch was called to the transfer/execute endpoint, not steward-sign
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain("/api/wallet/transfer/execute");
    });
  });

  describe("parameter validation", () => {
    it("rejects invalid recipient address", async () => {
      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        { content: { text: "send 1 BNB to invalid" } } as any,
        undefined,
        {
          parameters: { toAddress: "invalid", amount: "1", assetSymbol: "BNB" },
        } as any,
        callback,
      );

      expect((result as any).success).toBe(false);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ action: "TRANSFER_TOKEN_FAILED" }),
      );
    });

    it("rejects missing amount", async () => {
      const callback = vi.fn();
      const result = await transferTokenAction.handler(
        mockRuntime(),
        { content: { text: "" } } as any,
        undefined,
        {
          parameters: {
            toAddress: "0x000000000000000000000000000000000000dead",
            assetSymbol: "BNB",
          },
        } as any,
        callback,
      );

      expect((result as any).success).toBe(false);
    });
  });
});
