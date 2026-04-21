import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  handleWalletTradeExecuteRoute,
  type WalletTradeExecuteDeps,
} from "../../src/api/wallet-trade-routes";
import type { ElizaConfig } from "../../src/config/config";

const ENV_KEYS = ["EVM_PRIVATE_KEY"] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
});

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
  deps: WalletTradeExecuteDeps;
};

function createDeps(): WalletTradeExecuteDeps {
  return {
    getWalletAddresses: vi.fn(() => ({
      evmAddress: "0x1111111111111111111111111111111111111111",
      solanaAddress: null,
    })),
    resolveWalletRpcReadiness: vi.fn(() => ({
      bscRpcUrls: ["https://bsc.example/rpc"],
      cloudManagedAccess: true,
    })),
    resolveTradePermissionMode: vi.fn(() => "manual-local-key"),
    isAgentAutomationRequest: vi.fn(() => false),
    canUseLocalTradeExecution: vi.fn(() => true),
    buildBscTradeQuote: vi.fn(async () => ({
      ok: true,
      side: "buy",
      routeProvider: "0x",
      routeProviderRequested: "auto",
      routeProviderFallbackUsed: false,
      routerAddress: "0x2222222222222222222222222222222222222222",
      wrappedNativeAddress: "0x3333333333333333333333333333333333333333",
      tokenAddress: "0x4444444444444444444444444444444444444444",
      slippageBps: 300,
      route: [],
      quoteIn: { symbol: "BNB", amount: "0.01", amountWei: "1000" },
      quoteOut: { symbol: "USDT", amount: "2", amountWei: "2000" },
      minReceive: { symbol: "USDT", amount: "1.9", amountWei: "1900" },
      price: "200",
      preflight: {
        ok: true,
        walletAddress: "0x1111111111111111111111111111111111111111",
        rpcUrlHost: "bsc.example",
        chainId: 56,
        bnbBalance: "1",
        minGasBnb: "0.005",
        checks: {
          walletReady: true,
          rpcReady: true,
          chainReady: true,
          gasReady: true,
          tokenAddressValid: true,
        },
        reasons: [],
      },
      quotedAt: Date.now(),
    })),
    buildBscBuyUnsignedTx: vi.fn(() => ({
      chainId: 56,
      from: "0x1111111111111111111111111111111111111111",
      to: "0xaaaa00000000000000000000000000000000aaaa",
      data: "0xdeadbeef",
      valueWei: "1000",
      deadline: 9999999999,
      explorerUrl: "https://bscscan.com",
    })),
    buildBscSellUnsignedTx: vi.fn(() => ({
      chainId: 56,
      from: "0x1111111111111111111111111111111111111111",
      to: "0xbbbb00000000000000000000000000000000bbbb",
      data: "0xbeef",
      valueWei: "0",
      deadline: 9999999999,
      explorerUrl: "https://bscscan.com",
    })),
    buildBscApproveUnsignedTx: vi.fn(() => ({
      chainId: 56,
      from: "0x1111111111111111111111111111111111111111",
      to: "0x4444444444444444444444444444444444444444",
      data: "0xapprove",
      valueWei: "0",
      explorerUrl: "https://bscscan.com",
      spender: "0xspender",
      amountWei: "1000",
    })),
    resolveBscApprovalSpender: vi.fn(
      () => "0x5555555555555555555555555555555555555555",
    ),
    resolvePrimaryBscRpcUrl: vi.fn(() => "https://bsc.example/rpc"),
    assertQuoteFresh: vi.fn(),
    recordWalletTradeLedgerEntry: vi.fn(),
    createProvider: vi.fn(() => ({
      getTransactionCount: vi.fn(async () => 7),
      destroy: vi.fn(),
    })),
    createWallet: vi.fn(() => ({
      address: "0x1111111111111111111111111111111111111111",
      sendTransaction: vi.fn(async () => ({
        hash: "0xhash",
        gasLimit: 21000n,
        wait: vi.fn(async () => ({ status: 1 })),
      })),
    })),
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

async function invoke(args: {
  method: string;
  pathname: string;
  body?: Record<string, unknown> | null;
  deps?: WalletTradeExecuteDeps;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;
  const deps = args.deps ?? createDeps();

  const handled = await handleWalletTradeExecuteRoute({
    req: {} as IncomingMessage,
    res: {} as ServerResponse,
    method: args.method,
    pathname: args.pathname,
    state: {
      config: { env: {} } as ElizaConfig,
    },
    deps,
    readJsonBody: vi.fn(async () => args.body ?? null),
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return { handled, status, payload, deps };
}

describe("wallet trade execute route", () => {
  test("returns false for unrelated route", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/wallet/trade/quote",
    });
    expect(result.handled).toBe(false);
  });

  test("validates required trade body fields", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/trade/execute",
      body: { side: "buy" },
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(result.payload).toEqual({
      error: "side, tokenAddress, and amount are required",
    });
  });

  test("returns unsigned payload when confirm is not true", async () => {
    process.env.EVM_PRIVATE_KEY = "abc123";
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/trade/execute",
      body: {
        side: "buy",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        amount: "0.01",
        confirm: false,
      },
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        ok: true,
        executed: false,
        requiresUserSignature: true,
        mode: "local-key",
      }),
    );
    expect(result.deps.createProvider).not.toHaveBeenCalled();
  });

  test("executes and records pending ledger entry in local-key mode", async () => {
    process.env.EVM_PRIVATE_KEY = "abc123";
    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/trade/execute",
      body: {
        side: "buy",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        amount: "0.01",
        confirm: true,
        source: "agent",
      },
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual(
      expect.objectContaining({
        ok: true,
        mode: "local-key",
        executed: true,
        requiresUserSignature: false,
        execution: expect.objectContaining({
          hash: "0xhash",
          status: "submitted",
        }),
      }),
    );
    expect(result.deps.recordWalletTradeLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "0xhash",
        source: "agent",
        status: "pending",
      }),
    );
  });

  test("returns 500 when quote freshness assertion fails", async () => {
    process.env.EVM_PRIVATE_KEY = "abc123";
    const deps = createDeps();
    deps.assertQuoteFresh = vi.fn(() => {
      throw new Error("quote expired");
    });

    const result = await invoke({
      method: "POST",
      pathname: "/api/wallet/trade/execute",
      body: {
        side: "buy",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        amount: "0.01",
        confirm: true,
      },
      deps,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(500);
    expect(result.payload).toEqual({
      error: "Trade execution failed: quote expired",
    });
  });
});

