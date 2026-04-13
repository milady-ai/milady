import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../cloud/validate-url.js", () => ({
  validateCloudBaseUrl: vi.fn(async () => null),
}));

vi.mock("../config-env.js", async () => {
  const actual =
    await vi.importActual<typeof import("../config-env.js")>(
      "../config-env.js",
    );
  return {
    ...actual,
    persistConfigEnv: vi.fn(actual.persistConfigEnv),
  };
});

vi.mock("../../cloud/cloud-wallet.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../cloud/cloud-wallet.js")
  >("../../cloud/cloud-wallet.js");
  return {
    ...actual,
    getOrCreateClientAddressKey: vi.fn(),
    provisionCloudWallets: vi.fn(),
  };
});

import type http from "node:http";

import {
  getOrCreateClientAddressKey,
  provisionCloudWallets,
} from "../../cloud/cloud-wallet.js";
import { type CloudRouteState, handleCloudRoute } from "../cloud-routes.js";
import { persistConfigEnv } from "../config-env.js";

const ORIGINAL_ENV = { ...process.env };

function makeResponseCollector() {
  let body = "";
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string) {
      body = chunk ?? "";
    },
  } as unknown as http.ServerResponse;

  return {
    res,
    headers,
    readBody<T>() {
      return JSON.parse(body) as T;
    },
  };
}

describe("handleCloudRoute cloud wallet binding", () => {
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "cloud-wallet-bind-"));
    process.env = { ...ORIGINAL_ENV };
    process.env.MILADY_STATE_DIR = stateDir;
    process.env.ENABLE_CLOUD_WALLET = "1";
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("provisions cloud wallets, persists bind env, and awaits restart", async () => {
    vi.mocked(getOrCreateClientAddressKey).mockResolvedValue({
      privateKey: `0x${"11".repeat(32)}`,
      address: "0x1234567890abcdef1234567890abcdef12345678",
      minted: false,
    });
    vi.mocked(provisionCloudWallets).mockResolvedValue({
      evm: {
        agentWalletId: "wallet-evm",
        walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        walletProvider: "privy",
        chainType: "evm",
      },
      solana: {
        agentWalletId: "wallet-sol",
        walletAddress: "So11111111111111111111111111111111111111112",
        walletProvider: "steward",
        chainType: "solana",
      },
    });

    const savedConfigs: Array<Record<string, unknown>> = [];
    const restartRuntime = vi.fn(async () => true);
    const { res, readBody } = makeResponseCollector();
    const state: CloudRouteState = {
      config: {
        cloud: {
          baseUrl: "https://www.elizacloud.ai",
        },
      },
      cloudManager: {
        getClient: () =>
          ({
            listAgents: async () => [],
            createAgent: async () => ({}),
            deleteAgent: async () => undefined,
          }) as never,
        connect: async () => ({ agentName: "Milady" }),
        disconnect: async () => undefined,
        getStatus: () => "connected",
        getActiveAgentId: () => "agent-123",
      },
      runtime: {
        agentId: "agent-123",
        character: { secrets: {} },
        updateAgent: vi.fn(async () => undefined),
      },
      saveConfig: (config) => {
        savedConfigs.push(
          JSON.parse(JSON.stringify(config)) as Record<string, unknown>,
        );
      },
      restartRuntime,
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "authenticated",
            apiKey: "cloud-api-key",
            keyPrefix: "cloud-api",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as typeof fetch;

    const handled = await handleCloudRoute(
      {
        url: "/api/cloud/login/status?sessionId=session-123",
        headers: { host: "localhost" },
      } as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(readBody<{ status: string; keyPrefix: string }>()).toMatchObject({
      status: "authenticated",
      keyPrefix: "cloud-api",
    });
    expect(restartRuntime).toHaveBeenCalledWith("cloud-wallet-bound");
    expect(getOrCreateClientAddressKey).toHaveBeenCalledTimes(1);
    expect(provisionCloudWallets).toHaveBeenCalledTimes(1);

    const rawEnv = await fs.readFile(path.join(stateDir, "config.env"), "utf8");
    expect(rawEnv).toContain(
      "MILADY_CLOUD_EVM_ADDRESS=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
    expect(rawEnv).toContain(
      "MILADY_CLOUD_SOLANA_ADDRESS=So11111111111111111111111111111111111111112",
    );
    expect(rawEnv).toContain("ENABLE_EVM_PLUGIN=1");
    expect(rawEnv).toContain("WALLET_SOURCE_EVM=cloud");
    expect(rawEnv).toContain("WALLET_SOURCE_SOLANA=cloud");

    const lastSaved = savedConfigs.at(-1) as {
      wallet?: {
        primary?: Record<string, string>;
        cloud?: {
          evm?: { walletAddress?: string };
          solana?: { walletAddress?: string };
        };
      };
      cloud?: Record<string, unknown>;
    };
    expect(lastSaved.cloud?.apiKey).toBe("cloud-api-key");
    expect(lastSaved.cloud?.clientAddressPublicKey).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    expect(lastSaved.wallet?.primary).toEqual({
      evm: "cloud",
      solana: "cloud",
    });
    expect(lastSaved.wallet?.cloud?.evm?.walletAddress).toBe(
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
  });

  it("restores config.env and wallet config when wallet binding fails", async () => {
    const configEnvPath = path.join(stateDir, "config.env");
    await fs.writeFile(configEnvPath, "EXISTING=1\n", "utf8");

    vi.mocked(getOrCreateClientAddressKey).mockResolvedValue({
      privateKey: `0x${"22".repeat(32)}`,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      minted: true,
    });
    vi.mocked(provisionCloudWallets).mockResolvedValue({
      evm: {
        agentWalletId: "wallet-evm",
        walletAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        walletProvider: "privy",
        chainType: "evm",
      },
    });

    const actualConfigEnv =
      await vi.importActual<typeof import("../config-env.js")>(
        "../config-env.js",
      );
    vi.mocked(persistConfigEnv).mockImplementation(
      async (key, value, options) => {
        if (key === "WALLET_SOURCE_EVM") {
          throw new Error("forced persist failure");
        }
        return actualConfigEnv.persistConfigEnv(key, value, options);
      },
    );

    const savedConfigs: Array<Record<string, unknown>> = [];
    const restartRuntime = vi.fn(async () => true);
    const { res, readBody } = makeResponseCollector();
    const state: CloudRouteState = {
      config: {
        cloud: {
          baseUrl: "https://www.elizacloud.ai",
        },
      },
      cloudManager: {
        getClient: () =>
          ({
            listAgents: async () => [],
            createAgent: async () => ({}),
            deleteAgent: async () => undefined,
          }) as never,
        connect: async () => ({ agentName: "Milady" }),
        disconnect: async () => undefined,
        getStatus: () => "connected",
        getActiveAgentId: () => "agent-123",
      },
      runtime: {
        agentId: "agent-123",
        character: { secrets: {} },
        updateAgent: vi.fn(async () => undefined),
      },
      saveConfig: (config) => {
        savedConfigs.push(
          JSON.parse(JSON.stringify(config)) as Record<string, unknown>,
        );
      },
      restartRuntime,
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "authenticated",
            apiKey: "cloud-api-key",
            keyPrefix: "cloud-api",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as typeof fetch;

    await handleCloudRoute(
      {
        url: "/api/cloud/login/status?sessionId=session-123",
        headers: { host: "localhost" },
      } as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(readBody<{ status: string }>()).toMatchObject({
      status: "authenticated",
    });
    expect(restartRuntime).not.toHaveBeenCalled();
    expect(await fs.readFile(configEnvPath, "utf8")).toBe("EXISTING=1\n");
    expect(process.env.MILADY_CLOUD_EVM_ADDRESS).toBeUndefined();
    expect(process.env.ENABLE_EVM_PLUGIN).toBeUndefined();
    expect(process.env.WALLET_SOURCE_EVM).toBeUndefined();

    const lastSaved = savedConfigs.at(-1) as {
      cloud?: Record<string, unknown>;
      wallet?: Record<string, unknown>;
    };
    expect(lastSaved.cloud?.apiKey).toBe("cloud-api-key");
    expect(lastSaved.wallet).toBeUndefined();
  });
});
