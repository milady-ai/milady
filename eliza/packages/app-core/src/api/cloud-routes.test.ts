import { Readable } from "node:stream";
import type http from "node:http";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getOrCreateClientAddressKeyMock,
  persistCloudWalletCacheMock,
  provisionCloudWalletsMock,
  saveElizaConfigMock,
} = vi.hoisted(() => ({
  getOrCreateClientAddressKeyMock: vi.fn(),
  persistCloudWalletCacheMock: vi.fn(),
  provisionCloudWalletsMock: vi.fn(),
  saveElizaConfigMock: vi.fn(),
}));

vi.mock("@miladyai/agent/api/cloud-routes", () => ({
  handleCloudRoute: vi.fn(async () => false),
}));

vi.mock("@miladyai/agent/api/config-env", () => ({
  persistConfigEnv: vi.fn(async () => undefined),
}));

vi.mock("@miladyai/agent/cloud/bridge-client", () => ({
  ElizaCloudClient: class ElizaCloudClientMock {},
}));

vi.mock("@miladyai/agent/cloud/cloud-wallet", () => ({
  MILADY_CLOUD_CLIENT_ADDRESS_KEY_ENV: "MILADY_CLOUD_CLIENT_ADDRESS_KEY",
  getOrCreateClientAddressKey: getOrCreateClientAddressKeyMock,
  persistCloudWalletCache: persistCloudWalletCacheMock,
  provisionCloudWallets: provisionCloudWalletsMock,
}));

vi.mock("@miladyai/agent/config/config", () => ({
  saveElizaConfig: saveElizaConfigMock,
}));

vi.mock("./cloud-connection", () => ({
  disconnectUnifiedCloudConnection: vi.fn(async () => undefined),
}));

vi.mock("./cloud-secrets", () => ({
  clearCloudSecrets: vi.fn(),
  scrubCloudSecretsFromEnv: vi.fn(),
}));

import { handleCloudRoute } from "./cloud-routes";

function makeJsonRequest(
  url: string,
  body: unknown,
): http.IncomingMessage {
  const req = Readable.from([JSON.stringify(body)]) as http.IncomingMessage;
  req.method = "POST";
  req.url = url;
  req.headers = { host: "localhost:31337" };
  return req;
}

function makeResponse() {
  let body = "";
  const res = {
    headersSent: false,
    statusCode: 200,
    setHeader() {},
    end(chunk?: string) {
      body = chunk ?? "";
      this.headersSent = true;
    },
  } as unknown as http.ServerResponse & { headersSent: boolean };

  return {
    res,
    readBody: () => (body ? (JSON.parse(body) as Record<string, unknown>) : {}),
  };
}

describe("handleCloudRoute /api/cloud/login/persist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_CLOUD_WALLET = "1";
    getOrCreateClientAddressKeyMock.mockResolvedValue({
      privateKey: `0x${"11".repeat(32)}`,
      address: "0x1234567890abcdef1234567890abcdef12345678",
      minted: false,
    });
    provisionCloudWalletsMock.mockResolvedValue({
      evm: {
        agentWalletId: "wallet-evm",
        walletAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        walletProvider: "privy",
        chainType: "evm",
      },
      solana: {
        agentWalletId: "wallet-sol",
        walletAddress: "8RsmpM7Ztk5H2nesQSjk8okmFTiZFk4kBUcyaygPrVxa",
        walletProvider: "steward",
        chainType: "solana",
      },
    });
  });

  it("binds cloud wallets and restarts the runtime after persisting the api key", async () => {
    const { res, readBody } = makeResponse();
    const restartRuntime = vi.fn(async () => true);
    const config = {
      cloud: { baseUrl: "https://www.elizacloud.ai" },
      wallet: {},
    } as never;
    const runtime = {
      agentId: "agent-123",
      character: { secrets: {} },
      updateAgent: vi.fn(async () => undefined),
    } as never;

    const handled = await handleCloudRoute(
      makeJsonRequest("/api/cloud/login/persist", {
        apiKey: "cloud-api-key",
      }),
      res,
      "/api/cloud/login/persist",
      "POST",
      {
        config,
        runtime,
        cloudManager: null,
        restartRuntime,
      },
    );

    expect(handled).toBe(true);
    expect(readBody()).toEqual({ ok: true });
    expect(getOrCreateClientAddressKeyMock).toHaveBeenCalledTimes(1);
    expect(provisionCloudWalletsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agentId: "agent-123",
        clientAddress: "0x1234567890abcdef1234567890abcdef12345678",
      }),
    );
    expect(persistCloudWalletCacheMock).toHaveBeenCalledTimes(1);
    expect(saveElizaConfigMock).toHaveBeenCalled();
    expect(restartRuntime).toHaveBeenCalledWith("cloud-wallet-bound");
  });
});
