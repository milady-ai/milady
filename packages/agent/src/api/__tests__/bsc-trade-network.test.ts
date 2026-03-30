import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BscTradeQuoteResponse } from "../../contracts/wallet";
import {
  buildBscBuyUnsignedTx,
  resolveBscRpcUrls,
} from "../bsc-trade";

const ENV_KEYS = [
  "MILADY_WALLET_NETWORK",
  "BSC_TESTNET_RPC_URL",
  "BSC_TESTNET_SWAP_ROUTER_ADDRESS",
  "BSC_TESTNET_WRAPPED_NATIVE_ADDRESS",
  "BSC_TESTNET_CHAIN_ID",
  "BSC_TESTNET_EXPLORER_BASE_URL",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_BASE_URL",
] as const;

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
});

function makeQuote(routerAddress: string): BscTradeQuoteResponse {
  return {
    ok: true,
    side: "buy",
    routeProvider: "pancakeswap-v2",
    routeProviderRequested: "auto",
    routeProviderFallbackUsed: false,
    routerAddress,
    wrappedNativeAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    tokenAddress: "0x1111111111111111111111111111111111111111",
    slippageBps: 300,
    route: [
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      "0x1111111111111111111111111111111111111111",
    ],
    quoteIn: { symbol: "BNB", amount: "0.01", amountWei: "10000000000000000" },
    quoteOut: { symbol: "TKN", amount: "10", amountWei: "10000000000000000000" },
    minReceive: { symbol: "TKN", amount: "9.7", amountWei: "9700000000000000000" },
    price: "1000",
    preflight: {
      ok: true,
      walletAddress: "0x2222222222222222222222222222222222222222",
      rpcUrlHost: "rpc.example",
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
  };
}

describe("bsc-trade network mode", () => {
  it("uses mainnet chain id + explorer by default", () => {
    const quote = makeQuote("0x10ED43C718714eb63d5aA57B78B54704E256024E");
    const tx = buildBscBuyUnsignedTx(
      quote,
      "0x2222222222222222222222222222222222222222",
    );
    expect(tx.chainId).toBe(56);
    expect(tx.explorerUrl).toBe("https://bscscan.com");
  });

  it("uses testnet chain id + explorer when wallet network is testnet", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";
    process.env.BSC_TESTNET_SWAP_ROUTER_ADDRESS =
      "0x1234567890abcdef1234567890abcdef12345678";
    process.env.BSC_TESTNET_WRAPPED_NATIVE_ADDRESS =
      "0xae13d989dac2f0debff460ac112a837c89baa7cd";
    process.env.BSC_TESTNET_CHAIN_ID = "97";
    process.env.BSC_TESTNET_EXPLORER_BASE_URL = "https://testnet.bscscan.com";

    const quote = makeQuote("0x1234567890AbcdEF1234567890aBcdef12345678");
    const tx = buildBscBuyUnsignedTx(
      quote,
      "0x2222222222222222222222222222222222222222",
    );
    expect(tx.chainId).toBe(97);
    expect(tx.explorerUrl).toBe("https://testnet.bscscan.com");
  });

  it("rejects quote router mismatch in testnet mode", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";
    process.env.BSC_TESTNET_SWAP_ROUTER_ADDRESS =
      "0x1234567890abcdef1234567890abcdef12345678";
    process.env.BSC_TESTNET_WRAPPED_NATIVE_ADDRESS =
      "0xae13d989dac2f0debff460ac112a837c89baa7cd";

    const quote = makeQuote("0x10ED43C718714eb63d5aA57B78B54704E256024E");
    expect(() =>
      buildBscBuyUnsignedTx(
        quote,
        "0x2222222222222222222222222222222222222222",
      ),
    ).toThrow(/Unexpected router address/);
  });

  it("uses testnet RPC resolution without cloud mainnet proxy", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";
    process.env.BSC_TESTNET_RPC_URL = "https://bsc-test.custom/rpc";
    process.env.ELIZAOS_CLOUD_API_KEY = "cloud-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://cloud.example";

    const urls = resolveBscRpcUrls({ cloudManagedAccess: true });
    expect(urls).toContain("https://bsc-test.custom/rpc");
    expect(urls.join(" ")).not.toContain("/proxy/evm-rpc/bsc");
  });
});

