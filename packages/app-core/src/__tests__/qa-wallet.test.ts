import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MiladyClient } from "../api/client";

describe("QA: Wallet", () => {
  let client: MiladyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new MiladyClient("http://localhost:3000", "test-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("BTN-W001: getWalletBalances returns token balances", async () => {
    const balances = [
      { token: "ETH", balance: "1.5", usdValue: 2700.0 },
      { token: "USDC", balance: "500.0", usdValue: 500.0 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ balances }),
    });

    const result = await client.getWalletBalances();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/wallet/balances");
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].token).toBe("ETH");
    expect(result.balances[1].balance).toBe("500.0");
  });

  it("BTN-W002: getWalletNfts returns NFT list", async () => {
    const nfts = [
      { id: "nft-1", collection: "Milady Maker", tokenId: "4201" },
      { id: "nft-2", collection: "Remilio", tokenId: "7892" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nfts }),
    });

    const result = await client.getWalletNfts();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/wallet/nfts");
    expect(result.nfts).toHaveLength(2);
    expect(result.nfts[0].collection).toBe("Milady Maker");
  });

  it("BTN-W005: getBscTradeQuote returns quote with gas estimate", async () => {
    const quote = {
      inputToken: "BNB",
      outputToken: "CAKE",
      inputAmount: "1.0",
      outputAmount: "42.5",
      gasEstimate: "0.003",
      priceImpact: 0.12,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => quote,
    });

    const result = await client.getBscTradeQuote({
      inputToken: "BNB",
      outputToken: "CAKE",
      amount: "1.0",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/wallet/trade/quote");
    expect(result.outputAmount).toBe("42.5");
    expect(result.gasEstimate).toBe("0.003");
    expect(result.priceImpact).toBeTypeOf("number");
  });

  it("BTN-W006: executeBscTrade returns tx hash", async () => {
    const txResult = {
      txHash: "0xabc123def456789",
      status: "submitted",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => txResult,
    });

    const result = await client.executeBscTrade({
      inputToken: "BNB",
      outputToken: "CAKE",
      amount: "1.0",
      slippage: 0.5,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/wallet/trade/execute");
    expect(result.txHash).toBe("0xabc123def456789");
    expect(result.status).toBe("submitted");
  });

  it("BTN-W008: getWalletKeys returns key data", async () => {
    const keyData = {
      publicKey: "0xpub123",
      address: "0xaddr456",
      keyType: "secp256k1",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => keyData,
    });

    const result = await client.getWalletKeys();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/wallet/keys");
    expect(result.publicKey).toBe("0xpub123");
    expect(result.address).toBe("0xaddr456");
  });

  it("E2E-W003: setTradeMode('user-sign-only') succeeds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, tradePermissionMode: "user-sign-only" }),
    });

    const result = await client.setTradeMode("user-sign-only");

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/permissions/trade-mode");
    expect(result.ok).toBe(true);
    expect(result.tradePermissionMode).toBe("user-sign-only");
  });

  it("Error: getWalletBalances with 401 throws ApiError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized", message: "Invalid token" }),
    });

    await expect(client.getWalletBalances()).rejects.toThrow();
  });

  it("Error: executeBscTrade with 429 rate limit throws", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: "Too Many Requests",
        message: "Rate limit exceeded",
        retryAfter: 30,
      }),
    });

    await expect(
      client.executeBscTrade({
        inputToken: "BNB",
        outputToken: "CAKE",
        amount: "1.0",
        slippage: 0.5,
      })
    ).rejects.toThrow();
  });
});
