import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { handleHealthRoutes } from "../health-routes";
import { handleAgentStatusRoutes } from "../agent-status-routes";

const ORIGINAL_ENV = { ...process.env };

function makeJsonCollector() {
  const calls: Array<{ data: unknown; status?: number }> = [];
  return {
    json: (_res: unknown, data: unknown, status?: number) => {
      calls.push({ data, status });
    },
    calls,
  };
}

describe("cloud status + self-status routes", () => {
  beforeEach(() => {
    delete process.env.MILADY_CLOUD_PROVISIONED;
    delete process.env.ELIZA_CLOUD_PROVISIONED;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.ELIZA_API_TOKEN;
    delete process.env.STEWARD_AGENT_TOKEN;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
    delete process.env.ELIZAOS_CLOUD_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("GET /api/status reports cloud-provisioned containers as connected", async () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZA_API_TOKEN = "cloud-token";

    const { json, calls } = makeJsonCollector();

    const handled = await handleHealthRoutes({
      req: {} as never,
      res: {} as never,
      method: "GET",
      pathname: "/api/status",
      url: new URL("http://localhost/api/status"),
      state: {
        runtime: null,
        config: {},
        agentState: "running",
        agentName: "mlady",
        model: "anthropic/claude-sonnet-4.6",
        startedAt: 1,
        startup: { phase: "ready", attempt: 1 },
        plugins: [],
        pendingRestartReasons: [],
        connectorHealthMonitor: null,
      },
      json,
      error: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toMatchObject({
      cloud: {
        connectionStatus: "connected",
        activeAgentId: "mlady",
        cloudProvisioned: true,
        hasApiKey: false,
      },
    });
  });

  it("GET /api/status treats env-backed cloud API keys as connected", async () => {
    process.env.MILADY_CLOUD_PROVISIONED = "1";
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    process.env.ELIZAOS_CLOUD_API_KEY = "eliza_test_key";

    const { json, calls } = makeJsonCollector();

    const handled = await handleHealthRoutes({
      req: {} as never,
      res: {} as never,
      method: "GET",
      pathname: "/api/status",
      url: new URL("http://localhost/api/status"),
      state: {
        runtime: null,
        config: {},
        agentState: "running",
        agentName: "mlady",
        model: "anthropic/claude-sonnet-4.6",
        startedAt: 1,
        startup: { phase: "ready", attempt: 1 },
        plugins: [],
        pendingRestartReasons: [],
        connectorHealthMonitor: null,
      },
      json,
      error: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toMatchObject({
      cloud: {
        connectionStatus: "connected",
        activeAgentId: "mlady",
        cloudProvisioned: true,
        hasApiKey: true,
      },
    });
  });

  it("GET /api/agent/self-status returns model + wallet details", async () => {
    const { json, calls } = makeJsonCollector();

    const handled = await handleAgentStatusRoutes({
      req: {} as never,
      res: {} as never,
      method: "GET",
      pathname: "/api/agent/self-status",
      url: new URL("http://localhost/api/agent/self-status"),
      state: {
        config: {},
        runtime: {
          plugins: [
            { name: "@elizaos/plugin-anthropic" },
            { name: "@elizaos/plugin-evm" },
          ],
          character: { name: "mlady" },
        },
        agentState: "running",
        agentName: "mlady",
        model: "anthropic/claude-sonnet-4.6",
        shellEnabled: true,
        registryService: null,
      },
      json,
      error: vi.fn(),
      readJsonBody: vi.fn(),
      deps: {
        getWalletAddresses: () => ({
          evmAddress: "0x1111111111111111111111111111111111111111",
          solanaAddress: "So11111111111111111111111111111111111111112",
        }),
        resolveWalletCapabilityStatus: () => ({
          walletSource: "managed",
          hasWallet: true,
          hasEvm: true,
          evmAddress: "0x1111111111111111111111111111111111111111",
          localSignerAvailable: false,
          rpcReady: true,
          pluginEvmLoaded: true,
          pluginEvmRequired: true,
          executionReady: true,
          executionBlockedReason: null,
          automationMode: "full",
        }),
        resolveWalletRpcReadiness: () => ({ managedBscRpcReady: true }),
        resolveTradePermissionMode: () => "user-sign-only",
        canUseLocalTradeExecution: () => false,
        detectRuntimeModel: () => "anthropic/claude-sonnet-4.6",
        resolveProviderFromModel: () => "Anthropic",
        getGlobalAwarenessRegistry: () => null,
        isPrivyWalletProvisioningEnabled: () => false,
        ensurePrivyWalletsForCustomUser: async () => ({}),
        RegistryService: {
          defaultCapabilitiesHash: () => "0xcapabilities",
        },
      },
    });

    expect(handled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.data).toMatchObject({
      agentName: "mlady",
      model: "anthropic/claude-sonnet-4.6",
      provider: "Anthropic",
      wallet: {
        evmAddress: "0x1111111111111111111111111111111111111111",
        solanaAddress: "So11111111111111111111111111111111111111112",
        executionReady: true,
      },
    });
  });
});
