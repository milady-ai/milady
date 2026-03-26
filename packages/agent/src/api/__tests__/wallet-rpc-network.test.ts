import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveBscRpcUrls,
  resolveSolanaRpcUrls,
  resolveWalletRpcReadiness,
} from "../wallet-rpc";
import type { ElizaConfig } from "../../config/config";

const ENV_KEYS = [
  "MILADY_WALLET_NETWORK",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_BASE_URL",
  "BSC_RPC_URL",
  "BSC_TESTNET_RPC_URL",
  "SOLANA_RPC_URL",
  "SOLANA_TESTNET_RPC_URL",
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

describe("wallet-rpc network mode", () => {
  it("uses cloud-managed mainnet RPCs by default", () => {
    const bsc = resolveBscRpcUrls({
      cloudManagedAccess: true,
      cloudApiKey: "cloud-key",
      cloudBaseUrl: "https://cloud.example",
    });
    const sol = resolveSolanaRpcUrls({
      cloudManagedAccess: true,
      cloudApiKey: "cloud-key",
      cloudBaseUrl: "https://cloud.example",
    });

    expect(bsc).toEqual(
      expect.arrayContaining([
        "https://cloud.example/api/v1/proxy/evm-rpc/bsc?api_key=cloud-key",
        "https://bsc-dataseed1.binance.org/",
      ]),
    );
    expect(sol).toEqual(
      expect.arrayContaining([
        "https://cloud.example/api/v1/proxy/solana-rpc?api_key=cloud-key",
        "https://api.mainnet-beta.solana.com/",
      ]),
    );
  });

  it("uses testnet RPC defaults and omits cloud mainnet proxies in testnet mode", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";

    const bsc = resolveBscRpcUrls({
      cloudManagedAccess: true,
      cloudApiKey: "cloud-key",
      cloudBaseUrl: "https://cloud.example",
    });
    const sol = resolveSolanaRpcUrls({
      cloudManagedAccess: true,
      cloudApiKey: "cloud-key",
      cloudBaseUrl: "https://cloud.example",
    });

    expect(bsc).toEqual(
      expect.arrayContaining(["https://data-seed-prebsc-1-s1.binance.org:8545/"]),
    );
    expect(sol).toEqual(expect.arrayContaining(["https://api.devnet.solana.com/"]));
    expect(bsc.join(" ")).not.toContain("/proxy/evm-rpc/bsc");
    expect(sol.join(" ")).not.toContain("/proxy/solana-rpc");
  });

  it("respects explicit testnet RPC env overrides", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";
    process.env.BSC_TESTNET_RPC_URL = "https://bsc-test.custom/rpc";
    process.env.SOLANA_TESTNET_RPC_URL = "https://solana-test.custom/rpc";

    const bsc = resolveBscRpcUrls({ cloudManagedAccess: false });
    const sol = resolveSolanaRpcUrls({ cloudManagedAccess: false });

    expect(bsc[0]).toBe("https://bsc-test.custom/rpc");
    expect(sol[0]).toBe("https://solana-test.custom/rpc");
  });

  it("propagates testnet mode through wallet readiness", () => {
    process.env.MILADY_WALLET_NETWORK = "testnet";
    process.env.ELIZAOS_CLOUD_API_KEY = "cloud-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://cloud.example";

    const readiness = resolveWalletRpcReadiness({
      env: {},
      cloud: { apiKey: "cloud-key", baseUrl: "https://cloud.example" },
    } as ElizaConfig);

    expect(readiness.bscRpcUrls).toEqual(
      expect.arrayContaining(["https://data-seed-prebsc-1-s1.binance.org:8545/"]),
    );
    expect(readiness.solanaRpcUrls).toEqual(
      expect.arrayContaining(["https://api.devnet.solana.com/"]),
    );
    expect(readiness.bscRpcUrls.join(" ")).not.toContain("/proxy/evm-rpc/bsc");
    expect(readiness.solanaRpcUrls.join(" ")).not.toContain("/proxy/solana-rpc");
  });
});

