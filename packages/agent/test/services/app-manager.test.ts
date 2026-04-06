import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../../src/services/plugin-manager-types";

const appPackageModuleMocks = vi.hoisted(() => {
  const HyperscapeServiceStub = {
    serviceType: "hyperscapeService",
  };

  return {
    importAppPlugin: vi.fn(async (packageName: string) => ({
      name: packageName,
      services: [HyperscapeServiceStub],
    })),
    importAppRouteModule: vi.fn(),
  };
});

const registryClientMocks = vi.hoisted(() => ({
  getPluginInfo: vi.fn(async () => null),
  getRegistryPlugins: vi.fn(async () => new Map()),
}));

vi.mock("../../src/services/app-package-modules", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/app-package-modules")
  >("../../src/services/app-package-modules");
  return {
    ...actual,
    importAppPlugin: appPackageModuleMocks.importAppPlugin,
    importAppRouteModule:
      appPackageModuleMocks.importAppRouteModule.mockImplementation(
        actual.importAppRouteModule,
      ),
  };
});

vi.mock("../../src/services/registry-client", () => ({
  getPluginInfo: registryClientMocks.getPluginInfo,
  getRegistryPlugins: registryClientMocks.getRegistryPlugins,
}));

import { AppManager } from "../../src/services/app-manager";

const RS_2004SCAPE_APP_INFO: RegistryPluginInfo = {
  name: "@elizaos/app-2004scape",
  gitRepo: "elizaos/app-2004scape",
  gitUrl: "https://github.com/elizaos/app-2004scape",
  displayName: "2004Scape",
  description: "RuneScape 2004 agent integration",
  homepage: "",
  topics: ["game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  category: "game",
  launchType: "connect",
  launchUrl: "http://localhost:8880",
  runtimePlugin: undefined,
  capabilities: [],
  viewer: {
    url: "http://localhost:8880",
    embedParams: { bot: "{RS_SDK_BOT_NAME}" },
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  npm: {
    package: "@elizaos/app-2004scape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

const HYPERSCAPE_APP_INFO: RegistryPluginInfo = {
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  displayName: "Hyperscape",
  description: "Hyperscape live session bridge",
  homepage: "https://hyperscape.gg",
  topics: ["game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  category: "game",
  launchType: "connect",
  launchUrl: "{HYPERSCAPE_CLIENT_URL}",
  runtimePlugin: "@hyperscape/plugin-hyperscape",
  capabilities: ["combat"],
  viewer: {
    url: "{HYPERSCAPE_CLIENT_URL}",
    embedParams: {
      embedded: "true",
      mode: "spectator",
      surface: "agent-control",
      followEntity: "{HYPERSCAPE_CHARACTER_ID}",
    },
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  session: {
    mode: "spectate-and-steer",
    features: ["commands", "telemetry", "pause", "resume", "suggestions"],
  },
  appMeta: {
    displayName: "Hyperscape",
    category: "game",
    launchType: "connect",
    launchUrl: "{HYPERSCAPE_CLIENT_URL}",
    icon: null,
    capabilities: ["combat"],
    minPlayers: null,
    maxPlayers: null,
    runtimePlugin: "@hyperscape/plugin-hyperscape",
    viewer: {
      url: "{HYPERSCAPE_CLIENT_URL}",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
        followEntity: "{HYPERSCAPE_CHARACTER_ID}",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume", "suggestions"],
    },
  },
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

const BABYLON_APP_INFO: RegistryPluginInfo = {
  name: "@elizaos/app-babylon",
  gitRepo: "elizaos/app-babylon",
  gitUrl: "https://github.com/elizaos/app-babylon",
  displayName: "Babylon",
  description: "Babylon agent market interface",
  homepage: "https://staging.babylon.market",
  topics: ["game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  category: "game",
  launchType: "url",
  launchUrl: "{BABYLON_CLIENT_URL}",
  runtimePlugin: undefined,
  capabilities: ["trades", "prediction-markets", "social", "team-chat"],
  viewer: {
    url: "{BABYLON_CLIENT_URL}",
    embedParams: {
      embedded: "true",
    },
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  session: {
    mode: "spectate-and-steer",
    features: ["commands", "telemetry", "pause", "resume"],
  },
  appMeta: {
    displayName: "Babylon",
    category: "game",
    launchType: "url",
    launchUrl: "{BABYLON_CLIENT_URL}",
    icon: null,
    capabilities: ["trades", "prediction-markets", "social", "team-chat"],
    minPlayers: null,
    maxPlayers: null,
    runtimePlugin: undefined,
    viewer: {
      url: "{BABYLON_CLIENT_URL}",
      embedParams: {
        embedded: "true",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "pause", "resume"],
    },
  },
  npm: {
    package: "@elizaos/app-babylon",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

function buildPluginManager(
  installedPlugins: Array<{
    name: string;
    version?: string;
    installedAt?: string;
  }>,
  registryPlugin: RegistryPluginInfo | null = HYPERSCAPE_APP_INFO,
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () =>
      registryPlugin
        ? new Map([[registryPlugin.name, registryPlugin]])
        : new Map(),
    ),
    listInstalledPlugins: vi.fn(async () => installedPlugins),
    getRegistryPlugin: vi.fn(async () => registryPlugin),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: registryPlugin?.name ?? "@elizaos/app-hyperscape",
      version: "1.0.0",
      installPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: registryPlugin?.name ?? "@elizaos/app-hyperscape",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@elizaos/app-hyperscape",
      removedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
  };
}

function expectHyperscapeSessionState(
  session:
    | {
        sessionId?: string;
        mode?: string;
        status?: string;
        characterId?: string;
        followEntity?: string;
        canSendCommands?: boolean;
        controls?: string[];
        summary?: string | null;
        goalLabel?: string | null;
        suggestedPrompts?: string[];
      }
    | null
    | undefined,
  expected: {
    sessionId: string;
    characterId?: string;
    followEntity?: string;
    goalLabel?: string;
    suggestedPrompts?: string[];
    runningControls?: string[];
  },
): void {
  const base: Record<string, unknown> = {
    sessionId: expected.sessionId,
    mode: "spectate-and-steer",
  };
  if (expected.characterId !== undefined) {
    base.characterId = expected.characterId;
  }
  if (expected.followEntity !== undefined) {
    base.followEntity = expected.followEntity;
  }

  expect(session).toEqual(expect.objectContaining(base));
  if (!session) {
    throw new Error("Expected a Hyperscape session.");
  }

  if (session.status === "running") {
    const running: Record<string, unknown> = {
      status: "running",
      canSendCommands: true,
    };
    if (expected.runningControls !== undefined) {
      running.controls = expected.runningControls;
    }
    expect(session).toEqual(expect.objectContaining(running));
    if (expected.goalLabel !== undefined) {
      expect(session.goalLabel).toBe(expected.goalLabel);
    }
    if (expected.suggestedPrompts !== undefined) {
      expect(session.suggestedPrompts).toEqual(expected.suggestedPrompts);
    }
    return;
  }

  expect(session).toEqual(
    expect.objectContaining({
      status: "connecting",
      canSendCommands: false,
      controls: [],
      summary: "Connecting session...",
    }),
  );
}

function expectHyperscapeRunState(
  run:
    | {
        runId?: string;
        viewerAttachment?: string;
        status?: string;
        summary?: string | null;
        health?: {
          state?: string;
          message?: string | null;
        };
      }
    | null
    | undefined,
  expected: {
    runId?: string;
    viewerAttachment?: string;
  },
): void {
  const base: Record<string, unknown> = {};
  if (expected.runId !== undefined) {
    base.runId = expected.runId;
  }
  if (expected.viewerAttachment !== undefined) {
    base.viewerAttachment = expected.viewerAttachment;
  }

  expect(run).toEqual(expect.objectContaining(base));
  if (!run) {
    throw new Error("Expected a Hyperscape run summary.");
  }

  if (run.status === "running") {
    expect(run.health).toEqual(expect.objectContaining({ state: "healthy" }));
    return;
  }

  expect(run).toEqual(
    expect.objectContaining({
      status: "connecting",
      summary: "Connecting session...",
      health: expect.objectContaining({
        state: "degraded",
        message: "Connecting session...",
      }),
    }),
  );
}

type HyperscapeFixtureServer = {
  close: () => Promise<void>;
  url: string;
  walletAuthRequests: Array<{
    walletAddress?: string;
    walletType?: string;
    agentName?: string;
    agentId?: string;
  }>;
};

type BabylonFixtureServer = {
  close: () => Promise<void>;
  url: string;
  authRequests: Array<{
    agentId?: string;
    agentSecret?: string;
  }>;
};

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function startHyperscapeFixtureServer(): Promise<HyperscapeFixtureServer> {
  const walletAuthRequests: Array<{
    walletAddress?: string;
    walletType?: string;
    agentName?: string;
    agentId?: string;
  }> = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);
    res.setHeader("Content-Type", "application/json");

    if (req.method === "POST" && url.pathname === "/api/agents/wallet-auth") {
      const requestBody =
        body && typeof body === "object"
          ? (body as {
              walletAddress?: string;
              walletType?: string;
              agentName?: string;
              agentId?: string;
            })
          : {};
      walletAuthRequests.push(requestBody);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          authToken: "fixture-auth-token",
          characterId: "char-runtime",
          accountId: `wallet:${requestBody.walletType ?? "evm"}:${requestBody.walletAddress ?? "unknown"}`,
          agentId: requestBody.agentId ?? "runtime-agent-id",
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/mapping/runtime-agent-id"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          accountId: "wallet:evm:0x1234567890123456789012345678901234567890",
          agentName: "Scout",
        }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/embedded-agents") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agents: [
            {
              agentId: "runtime-agent-id",
              characterId: "char-runtime",
              entityId: "char-runtime",
              name: "Scout",
              state: "running",
              lastActivity: 1_710_000_000_000,
              startedAt: 1_709_999_000_000,
            },
          ],
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/goal"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goal: { description: "Scout the ruins" },
          goalsPaused: false,
          availableGoals: [{ description: "Scout the ruins", type: "explore" }],
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/quick-actions"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          quickCommands: [
            { label: "Scout", command: "scan nearby ruins", available: true },
          ],
          nearbyLocations: [{ name: "Ruins" }],
          playerPosition: [12, 0, 18],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(
      JSON.stringify({ error: `Unhandled ${req.method} ${url.pathname}` }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve Hyperscape fixture server address.");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}`,
    walletAuthRequests,
  };
}

async function startBabylonFixtureServer(): Promise<BabylonFixtureServer> {
  const authRequests: Array<{
    agentId?: string;
    agentSecret?: string;
  }> = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && url.pathname === "/api/health") {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/agents/auth") {
      const requestBody =
        body && typeof body === "object"
          ? (body as {
              agentId?: string;
              agentSecret?: string;
            })
          : {};
      authRequests.push(requestBody);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          sessionToken: "fixture-babylon-session-token",
          expiresAt: "2026-04-07T00:00:00.000Z",
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/babylon-agent-alice/summary"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agent: {
            id: "babylon-agent-alice",
            name: "Babylon Alice",
            username: "babylon_alice",
            virtualBalance: 1250,
            lifetimePnL: 45,
            totalTrades: 9,
            winRate: 0.66,
            autonomousEnabled: true,
            autonomousTrading: true,
            autonomousPosting: true,
            autonomousCommenting: false,
            autonomousDMs: false,
            status: "active",
          },
          portfolio: {
            totalPnL: 45,
            positions: 3,
            totalAssets: 1295,
            available: 980,
            wallet: 1250,
            agents: 1250,
            totalPoints: 0,
          },
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/babylon-agent-alice/goals"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goals: [
            {
              id: "goal-1",
              description: "Coordinate the desk around ETH momentum",
              status: "active",
              createdAt: "2026-04-06T00:00:00.000Z",
            },
          ],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err?: Error | null) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve Babylon fixture server address.");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}`,
    authRequests,
  };
}

function createRuntimeStub(overrides?: {
  agentId?: string;
  characterName?: string;
  settings?: Record<string, string>;
  agentRecord?: unknown;
}): IAgentRuntime {
  const settings = new Map<string, string>(
    Object.entries(overrides?.settings ?? {}),
  );
  const plugins: Array<{ name: string }> = [];
  const services = new Set<string>();
  return {
    agentId: (overrides?.agentId ??
      "runtime-agent-id") as IAgentRuntime["agentId"],
    character: {
      name: overrides?.characterName ?? "Scout",
    } as IAgentRuntime["character"],
    plugins,
    getAgent: vi.fn(async () => overrides?.agentRecord ?? null),
    getSetting: (key: string) => settings.get(key) ?? null,
    hasService: (serviceType: string) => services.has(serviceType),
    getServiceLoadPromise: vi.fn(async () => ({})),
    setSetting: (key: string, value: string | boolean | null) => {
      if (typeof value === "string") {
        settings.set(key, value);
      }
    },
    registerPlugin: vi.fn(async (plugin) => {
      plugins.push({ name: plugin.name });
      for (const service of plugin.services ?? []) {
        if (typeof service?.serviceType === "string") {
          services.add(service.serviceType);
        }
      }
    }),
  } as unknown as IAgentRuntime;
}

describe("AppManager", () => {
  const originalApiUrl = process.env.HYPERSCAPE_API_URL;
  const originalHyperscapeAuthToken = process.env.HYPERSCAPE_AUTH_TOKEN;
  const originalHyperscapeCharacterId = process.env.HYPERSCAPE_CHARACTER_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEvmPrivateKey = process.env.EVM_PRIVATE_KEY;
  const originalSolanaPrivateKey = process.env.SOLANA_PRIVATE_KEY;
  const originalBabylonApiUrl = process.env.BABYLON_API_URL;
  const originalBabylonClientUrl = process.env.BABYLON_CLIENT_URL;
  const originalBabylonAgentId = process.env.BABYLON_AGENT_ID;
  const originalBabylonAgentSecret = process.env.BABYLON_AGENT_SECRET;
  const originalBabylonAgentSessionToken =
    process.env.BABYLON_AGENT_SESSION_TOKEN;
  const originalBabylonAgentSessionExpiresAt =
    process.env.BABYLON_AGENT_SESSION_EXPIRES_AT;

  beforeEach(async () => {
    appPackageModuleMocks.importAppPlugin.mockClear();
    appPackageModuleMocks.importAppRouteModule.mockReset();
    const actual = await vi.importActual<
      typeof import("../../src/services/app-package-modules")
    >("../../src/services/app-package-modules");
    appPackageModuleMocks.importAppRouteModule.mockImplementation(
      actual.importAppRouteModule,
    );
  });

  afterEach(() => {
    if (originalApiUrl !== undefined) {
      process.env.HYPERSCAPE_API_URL = originalApiUrl;
    } else {
      delete process.env.HYPERSCAPE_API_URL;
    }
    if (originalHyperscapeAuthToken !== undefined) {
      process.env.HYPERSCAPE_AUTH_TOKEN = originalHyperscapeAuthToken;
    } else {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
    }
    if (originalHyperscapeCharacterId !== undefined) {
      process.env.HYPERSCAPE_CHARACTER_ID = originalHyperscapeCharacterId;
    } else {
      delete process.env.HYPERSCAPE_CHARACTER_ID;
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalEvmPrivateKey !== undefined) {
      process.env.EVM_PRIVATE_KEY = originalEvmPrivateKey;
    } else {
      delete process.env.EVM_PRIVATE_KEY;
    }
    if (originalSolanaPrivateKey !== undefined) {
      process.env.SOLANA_PRIVATE_KEY = originalSolanaPrivateKey;
    } else {
      delete process.env.SOLANA_PRIVATE_KEY;
    }
    if (originalBabylonApiUrl !== undefined) {
      process.env.BABYLON_API_URL = originalBabylonApiUrl;
    } else {
      delete process.env.BABYLON_API_URL;
    }
    if (originalBabylonClientUrl !== undefined) {
      process.env.BABYLON_CLIENT_URL = originalBabylonClientUrl;
    } else {
      delete process.env.BABYLON_CLIENT_URL;
    }
    if (originalBabylonAgentId !== undefined) {
      process.env.BABYLON_AGENT_ID = originalBabylonAgentId;
    } else {
      delete process.env.BABYLON_AGENT_ID;
    }
    if (originalBabylonAgentSecret !== undefined) {
      process.env.BABYLON_AGENT_SECRET = originalBabylonAgentSecret;
    } else {
      delete process.env.BABYLON_AGENT_SECRET;
    }
    if (originalBabylonAgentSessionToken !== undefined) {
      process.env.BABYLON_AGENT_SESSION_TOKEN =
        originalBabylonAgentSessionToken;
    } else {
      delete process.env.BABYLON_AGENT_SESSION_TOKEN;
    }
    if (originalBabylonAgentSessionExpiresAt !== undefined) {
      process.env.BABYLON_AGENT_SESSION_EXPIRES_AT =
        originalBabylonAgentSessionExpiresAt;
    } else {
      delete process.env.BABYLON_AGENT_SESSION_EXPIRES_AT;
    }
    appPackageModuleMocks.importAppPlugin.mockReset();
    appPackageModuleMocks.importAppPlugin.mockImplementation(
      async (packageName: string) => ({
        name: packageName,
        services: [{ serviceType: "hyperscapeService" }],
      }),
    );
    registryClientMocks.getPluginInfo.mockReset();
    registryClientMocks.getPluginInfo.mockResolvedValue(null);
    registryClientMocks.getRegistryPlugins.mockReset();
    registryClientMocks.getRegistryPlugins.mockResolvedValue(new Map());
  });

  it("preserves the recorded install timestamp when plugin manager provides one", async () => {
    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.2.3",
          installedAt: "2026-04-04T12:34:56.000Z",
        },
      ]),
    );

    expect(installed).toEqual([
      expect.objectContaining({
        name: "@elizaos/app-hyperscape",
        version: "1.2.3",
        installedAt: "2026-04-04T12:34:56.000Z",
      }),
    ]);
  });

  it("returns an empty install timestamp when none is recorded", async () => {
    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.2.3",
        },
      ]),
    );

    expect(installed[0]?.installedAt).toBe("");
  });

  it("treats plugin-backed app packages as installed apps", async () => {
    const pluginBackedApp: RegistryPluginInfo = {
      ...HYPERSCAPE_APP_INFO,
      name: "@hyperscape/plugin-hyperscape",
      gitRepo: "hyperscape/plugin-hyperscape",
      gitUrl: "https://github.com/hyperscape/plugin-hyperscape",
      runtimePlugin: "@hyperscape/plugin-hyperscape",
      npm: {
        package: "@hyperscape/plugin-hyperscape",
        v0Version: null,
        v1Version: "1.2.3",
        v2Version: "1.2.3",
      },
    };

    const manager = new AppManager();
    const installed = await manager.listInstalled(
      buildPluginManager(
        [
          {
            name: "@hyperscape/plugin-hyperscape",
            version: "1.2.3",
            installedAt: "2026-04-05T01:30:00.000Z",
          },
        ],
        pluginBackedApp,
      ),
    );

    expect(installed).toEqual([
      expect.objectContaining({
        name: "@hyperscape/plugin-hyperscape",
        displayName: "Hyperscape",
        pluginName: "@hyperscape/plugin-hyperscape",
        version: "1.2.3",
        installedAt: "2026-04-05T01:30:00.000Z",
      }),
    ]);
  });

  it("merges local app metadata into existing registry entries for the apps catalog", async () => {
    const remoteInfo: RegistryPluginInfo = {
      ...HYPERSCAPE_APP_INFO,
      kind: undefined,
      launchType: undefined,
      launchUrl: undefined,
      viewer: undefined,
      session: undefined,
      appMeta: undefined,
      localPath: undefined,
      description: "Remote registry description",
    };
    registryClientMocks.getRegistryPlugins.mockResolvedValue(
      new Map<string, RegistryPluginInfo>([
        [
          HYPERSCAPE_APP_INFO.name,
          { ...HYPERSCAPE_APP_INFO, localPath: "/tmp/hyperscape" },
        ],
      ]),
    );

    const manager = new AppManager();
    const pluginManager = buildPluginManager([], remoteInfo);
    (
      pluginManager.refreshRegistry as ReturnType<typeof vi.fn>
    ).mockResolvedValue(
      new Map<string, RegistryPluginInfo>([
        [HYPERSCAPE_APP_INFO.name, remoteInfo],
      ]),
    );

    const apps = await manager.listAvailable(pluginManager);

    expect(apps).toEqual([
      expect.objectContaining({
        name: "@elizaos/app-hyperscape",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        localPath: "/tmp/hyperscape",
        viewer: expect.objectContaining({
          url: "http://localhost:3333",
          postMessageAuth: true,
        }),
        session: expect.objectContaining({
          mode: "spectate-and-steer",
        }),
      }),
    ]);
  });

  it("resolves a live Hyperscape session at launch instead of returning a synthetic pending session", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(runtime.registerPlugin).toHaveBeenCalledTimes(1);
      expect(result.viewer?.url).toBe(
        "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control&followEntity=char-runtime",
      );
      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          authToken: "fixture-auth-token",
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          followEntity: "char-runtime",
        }),
      );
      expectHyperscapeSessionState(result.session, {
        sessionId: "runtime-agent-id",
        runningControls: ["pause"],
        goalLabel: "Scout the ruins",
        suggestedPrompts: ["scan nearby ruins"],
        characterId: "char-runtime",
        followEntity: "char-runtime",
      });
      expect(result.run).toEqual(
        expect.objectContaining({
          appName: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          characterId: "char-runtime",
          agentId: "runtime-agent-id",
          viewerAttachment: "attached",
          supportsViewerDetach: true,
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              kind: "launch",
              message: expect.any(String),
            }),
          ]),
          awaySummary: expect.objectContaining({
            eventCount: 1,
            message: expect.any(String),
          }),
          healthDetails: expect.objectContaining({
            checkedAt: expect.any(String),
          }),
        }),
      );
      if (result.run?.status === "running") {
        expect(result.run).toEqual(
          expect.objectContaining({
            health: expect.objectContaining({
              state: "healthy",
            }),
          }),
        );
      } else {
        expect(result.run).toEqual(
          expect.objectContaining({
            status: "connecting",
            summary: "Connecting session...",
            health: expect.objectContaining({
              state: "degraded",
              message: "Connecting session...",
            }),
          }),
        );
      }
    } finally {
      await fixtureServer.close();
    }
  });

  it("persists app runs and supports attach-detach-stop lifecycle by run id", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-app-runs-"));

    try {
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const manager = new AppManager({ stateDir });
      const launchResult = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(launchResult.run?.runId).toEqual(expect.any(String));
      const runId = launchResult.run?.runId;
      expect(runId).toBeTruthy();
      if (!runId) {
        throw new Error("Expected Hyperscape launch to return a run id.");
      }

      const runsAfterLaunch = await manager.listRuns();
      expect(runsAfterLaunch).toHaveLength(1);
      expectHyperscapeRunState(runsAfterLaunch[0], {
        runId,
        viewerAttachment: "attached",
      });

      const detached = await manager.detachRun(runId);
      expect(detached).toEqual(
        expect.objectContaining({
          success: true,
          run: expect.objectContaining({
            runId,
            viewerAttachment: "detached",
          }),
        }),
      );

      const reloadedManager = new AppManager({ stateDir });
      expect(await reloadedManager.getRun(runId)).toEqual(
        expect.objectContaining({
          runId,
          viewerAttachment: "detached",
        }),
      );

      const attached = await reloadedManager.attachRun(runId);
      expect(attached).toEqual(
        expect.objectContaining({
          success: true,
          run: expect.objectContaining({
            runId,
            viewerAttachment: "attached",
          }),
        }),
      );

      const stopResult = await reloadedManager.stop(
        buildPluginManager([]),
        "",
        runId,
      );
      expect(stopResult).toEqual(
        expect.objectContaining({
          success: true,
          runId,
          stopScope: "viewer-session",
          pluginUninstalled: false,
          needsRestart: false,
        }),
      );
      expect(await reloadedManager.listRuns()).toEqual([]);
    } finally {
      fs.rmSync(stateDir, { force: true, recursive: true });
      await fixtureServer.close();
    }
  });

  it("launches Hyperscape from the bare slug when local registry lookup resolves the app package", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    registryClientMocks.getPluginInfo.mockImplementation(
      async (name: string) =>
        name === "hyperscape" ? HYPERSCAPE_APP_INFO : null,
    );

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const pluginManager = buildPluginManager([], null);

      const result = await manager.launch(
        pluginManager,
        "hyperscape",
        undefined,
        runtime,
      );

      expect(pluginManager.getRegistryPlugin).toHaveBeenCalledWith(
        "hyperscape",
      );
      expect(result.displayName).toBe("Hyperscape");
      expect(result.viewer?.url).toContain("http://localhost:3333");
      expectHyperscapeSessionState(result.session, {
        sessionId: "runtime-agent-id",
        characterId: "char-runtime",
        followEntity: "char-runtime",
      });
    } finally {
      await fixtureServer.close();
    }
  });

  it("uses hyperscape.gg as the production viewer default", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    delete process.env.HYPERSCAPE_CLIENT_URL;
    process.env.NODE_ENV = "production";

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });
      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(result.launchUrl).toBe("https://hyperscape.gg");
      expect(result.viewer?.url).toContain("https://hyperscape.gg");
    } finally {
      await fixtureServer.close();
    }
  });

  it("loads the Hyperscape runtime plugin when the wrapper plugin is present without the runtime service", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    appPackageModuleMocks.importAppPlugin.mockImplementation(
      async (packageName: string) => {
        if (packageName === "@hyperscape/plugin-hyperscape") {
          return {
            name: packageName,
            services: [{ serviceType: "hyperscapeService" }],
          };
        }
        if (packageName === "@elizaos/app-hyperscape") {
          return { name: packageName };
        }
        return null;
      },
    );

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      });

      await runtime.registerPlugin?.({
        name: "@elizaos/app-hyperscape",
      } as never);

      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(appPackageModuleMocks.importAppPlugin).toHaveBeenCalledWith(
        "@hyperscape/plugin-hyperscape",
      );
      expectHyperscapeSessionState(result.session, {
        sessionId: "runtime-agent-id",
        characterId: "char-runtime",
        followEntity: "char-runtime",
      });
    } finally {
      await fixtureServer.close();
    }
  });

  it("auto-provisions a local wallet for Hyperscape launch when the runtime has none", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;

    try {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
      delete process.env.HYPERSCAPE_CHARACTER_ID;
      delete process.env.EVM_PRIVATE_KEY;
      delete process.env.SOLANA_PRIVATE_KEY;

      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
      }) as IAgentRuntime & {
        getSetting: (key: string) => string | null;
      };

      const result = await manager.launch(
        buildPluginManager([]),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );

      expect(fixtureServer.walletAuthRequests).toHaveLength(1);
      expect(fixtureServer.walletAuthRequests[0]?.walletType).toBe("evm");
      expect(fixtureServer.walletAuthRequests[0]?.walletAddress).toMatch(
        /^0x[0-9a-f]{40}$/i,
      );
      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  it("launches Babylon with a real session token and resolved live operator session", async () => {
    const fixtureServer = await startBabylonFixtureServer();
    process.env.BABYLON_API_URL = fixtureServer.url;
    process.env.BABYLON_CLIENT_URL = fixtureServer.url;

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        settings: {
          BABYLON_API_URL: fixtureServer.url,
          BABYLON_CLIENT_URL: fixtureServer.url,
          BABYLON_AGENT_ID: "babylon-agent-alice",
          BABYLON_AGENT_SECRET: "fixture-babylon-secret",
        },
      });

      const result = await manager.launch(
        buildPluginManager([], BABYLON_APP_INFO),
        "@elizaos/app-babylon",
        undefined,
        runtime,
      );

      expect(fixtureServer.authRequests).toEqual([
        {
          agentId: "babylon-agent-alice",
          agentSecret: "fixture-babylon-secret",
        },
        {
          agentId: "babylon-agent-alice",
          agentSecret: "fixture-babylon-secret",
        },
      ]);
      expect(result.viewer?.url).toBe(`${fixtureServer.url}?embedded=true`);
      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "BABYLON_AUTH",
          authToken: "fixture-babylon-session-token",
          sessionToken: "fixture-babylon-session-token",
          agentId: "babylon-agent-alice",
        }),
      );
      expect(result.session).toEqual(
        expect.objectContaining({
          sessionId: "babylon-agent-alice",
          appName: "@elizaos/app-babylon",
          mode: "spectate-and-steer",
          status: "connecting",
          displayName: "Babylon",
          goalLabel: null,
          canSendCommands: true,
          controls: ["pause", "resume"],
          telemetry: null,
          summary: "Connecting to Babylon...",
        }),
      );
      expect(result.run).toEqual(
        expect.objectContaining({
          agentId: "babylon-agent-alice",
          viewerAttachment: "attached",
          supportsViewerDetach: true,
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              kind: "launch",
              message: expect.any(String),
            }),
          ]),
          awaySummary: expect.objectContaining({
            eventCount: 1,
          }),
        }),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  describe("multi-app control plane", () => {
    it("refreshes multiple persisted app runs through their route modules when listing runs", async () => {
      const stateDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "milady-app-manager-refresh-"),
      );
      const manager = new AppManager({ stateDir });
      const defenseAppInfo: RegistryPluginInfo = {
        name: "@elizaos/app-defense-of-the-agents",
        gitRepo: "elizaos/app-defense-of-the-agents",
        gitUrl: "https://github.com/elizaos/app-defense-of-the-agents",
        displayName: "Defense of the Agents",
        description: "Autonomous defense lane simulator",
        homepage: "https://www.defenseoftheagents.com",
        topics: ["game"],
        stars: 0,
        language: "TypeScript",
        kind: "app",
        category: "game",
        launchType: "url",
        launchUrl: "https://www.defenseoftheagents.com",
        runtimePlugin: undefined,
        capabilities: ["combat", "strategy"],
        viewer: {
          url: "http://localhost:31337/api/apps/defense-of-the-agents/viewer",
          sandbox: "allow-scripts allow-same-origin allow-popups",
        },
        session: {
          mode: "spectate-and-steer",
          features: ["commands", "telemetry", "pause", "resume"],
        },
        npm: {
          package: "@elizaos/app-defense-of-the-agents",
          v0Version: null,
          v1Version: "1.0.0",
          v2Version: "1.0.0",
        },
        supports: { v0: false, v1: true, v2: true },
      };
      const runtime = createRuntimeStub({
        settings: {
          HYPERSCAPE_CHARACTER_ID: "char-runtime",
        },
      });
      const resolveLaunchSession = vi.fn(
        async ({ appName }: { appName: string }) => {
          if (appName === "@elizaos/app-defense-of-the-agents") {
            return {
              sessionId: "defense-session",
              appName,
              mode: "spectate-and-steer" as const,
              status: "connecting",
              displayName: "Defense of the Agents",
              agentId: "runtime-agent-id",
              canSendCommands: true,
              controls: ["pause", "resume"] as const,
              summary: "Connecting defense session...",
            };
          }
          return {
            sessionId: "char-runtime",
            appName,
            mode: "spectate-and-steer" as const,
            status: "connecting",
            displayName: "Hyperscape",
            agentId: "runtime-agent-id",
            characterId: "char-runtime",
            followEntity: "char-runtime",
            canSendCommands: false,
            controls: [],
            summary: "Connecting session...",
          };
        },
      );
      const refreshRunSession = vi.fn(
        async ({ appName }: { appName: string }) => {
          if (appName === "@elizaos/app-defense-of-the-agents") {
            return {
              sessionId: "defense-session",
              appName,
              mode: "spectate-and-steer" as const,
              status: "running",
              displayName: "Defense of the Agents",
              agentId: "runtime-agent-id",
              canSendCommands: true,
              controls: ["pause"] as const,
              summary: "Defense loop is holding mid lane.",
              telemetry: {
                heroLane: "mid",
              },
            };
          }
          return {
            sessionId: "char-runtime",
            appName,
            mode: "spectate-and-steer" as const,
            status: "running",
            displayName: "Hyperscape",
            agentId: "runtime-agent-id",
            characterId: "char-runtime",
            followEntity: "char-runtime",
            canSendCommands: true,
            controls: ["pause"] as const,
            summary: "Running live in Hyperscape.",
            goalLabel: "Scout the ruins",
            suggestedPrompts: ["scan nearby ruins"],
            telemetry: {
              nearbyLocationCount: 1,
            },
          };
        },
      );
      appPackageModuleMocks.importAppRouteModule.mockResolvedValue({
        resolveLaunchSession,
        refreshRunSession,
      });

      const launchedHyperscape = await manager.launch(
        buildPluginManager([], HYPERSCAPE_APP_INFO),
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );
      const launchedBabylon = await manager.launch(
        buildPluginManager([], defenseAppInfo),
        "@elizaos/app-defense-of-the-agents",
        undefined,
        runtime,
      );
      expect(launchedHyperscape.run?.status).toBe("connecting");
      expect(launchedBabylon.run?.status).toBe("connecting");

      const runs = await manager.listRuns(runtime);

      expect(refreshRunSession).toHaveBeenCalledTimes(2);
      expect(refreshRunSession).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: "@elizaos/app-hyperscape",
          runId: launchedHyperscape.run?.runId,
        }),
      );
      expect(refreshRunSession).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: "@elizaos/app-defense-of-the-agents",
          runId: launchedBabylon.run?.runId,
        }),
      );
      expect(runs).toHaveLength(2);
      expect(
        runs.find((run) => run.appName === "@elizaos/app-hyperscape"),
      ).toEqual(
        expect.objectContaining({
          runId: launchedHyperscape.run?.runId,
          characterId: "char-runtime",
          agentId: "runtime-agent-id",
          status: "running",
          summary: "Running live in Hyperscape.",
          lastHeartbeatAt: expect.any(String),
          chatAvailability: "available",
          controlAvailability: "available",
          supportsViewerDetach: true,
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              kind: "refresh",
              message: "Running live in Hyperscape.",
            }),
            expect.objectContaining({
              kind: "launch",
            }),
          ]),
          awaySummary: expect.objectContaining({
            eventCount: 2,
            message: expect.stringContaining("Running live in Hyperscape."),
          }),
          healthDetails: expect.objectContaining({
            checkedAt: expect.any(String),
            runtime: expect.objectContaining({ state: "healthy" }),
            chat: expect.objectContaining({ state: "healthy" }),
            control: expect.objectContaining({ state: "healthy" }),
          }),
          health: {
            state: "healthy",
            message: "Running live in Hyperscape.",
          },
        }),
      );
      expect(
        runs.find(
          (run) => run.appName === "@elizaos/app-defense-of-the-agents",
        ),
      ).toEqual(
        expect.objectContaining({
          runId: launchedBabylon.run?.runId,
          agentId: "runtime-agent-id",
          status: "running",
          summary: "Defense loop is holding mid lane.",
          lastHeartbeatAt: expect.any(String),
          chatAvailability: "available",
          controlAvailability: "available",
          supportsViewerDetach: true,
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              kind: "refresh",
              message: "Defense loop is holding mid lane.",
            }),
            expect.objectContaining({
              kind: "launch",
            }),
          ]),
          awaySummary: expect.objectContaining({
            eventCount: 2,
            message: expect.stringContaining("Defense loop is holding mid lane."),
          }),
          healthDetails: expect.objectContaining({
            checkedAt: expect.any(String),
            runtime: expect.objectContaining({ state: "healthy" }),
          }),
          health: {
            state: "healthy",
            message: "Defense loop is holding mid lane.",
          },
        }),
      );
    });

    it("marks runs degraded when verification fails during attach", async () => {
      const stateDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "milady-app-manager-attach-"),
      );
      const manager = new AppManager({ stateDir });
      const pluginManager = buildPluginManager([], HYPERSCAPE_APP_INFO);
      const runtime = createRuntimeStub({
        settings: {
          HYPERSCAPE_CHARACTER_ID: "char-runtime",
        },
      });
      appPackageModuleMocks.importAppRouteModule.mockResolvedValue({
        resolveLaunchSession: vi.fn(async () => ({
          sessionId: "char-runtime",
          appName: "@elizaos/app-hyperscape",
          mode: "spectate-and-steer" as const,
          status: "connecting",
          displayName: "Hyperscape",
          agentId: "runtime-agent-id",
          characterId: "char-runtime",
          followEntity: "char-runtime",
          canSendCommands: false,
          controls: [],
          summary: "Connecting session...",
        })),
        refreshRunSession: vi.fn(async () => {
          throw new Error("viewer bridge is offline");
        }),
      });

      const launched = await manager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
        undefined,
        runtime,
      );
      const launchedRunId = launched.run?.runId ?? "";
      expect(launchedRunId).not.toBe("");
      const result = await manager.attachRun(launchedRunId, runtime);

      expect(result.success).toBe(true);
      expect(result.run).toEqual(
        expect.objectContaining({
          runId: launchedRunId,
          viewerAttachment: "attached",
          status: "disconnected",
          summary: "Run verification failed: viewer bridge is offline",
          health: {
            state: "degraded",
            message: "Run verification failed: viewer bridge is offline",
          },
          session: expect.objectContaining({
            status: "disconnected",
            canSendCommands: false,
            controls: [],
          }),
          recentEvents: expect.arrayContaining([
            expect.objectContaining({
              kind: "health",
              severity: "error",
              message: "Run verification failed: viewer bridge is offline",
            }),
            expect.objectContaining({
              kind: "launch",
            }),
          ]),
          awaySummary: expect.objectContaining({
            message: expect.stringContaining("Run verification failed: viewer bridge is offline"),
          }),
        }),
      );
    });
  });

  describe("2004scape server reachability", () => {
    const originalBotName = process.env.RS_SDK_BOT_NAME;
    const originalBotPassword = process.env.RS_SDK_BOT_PASSWORD;
    const originalBotNameCompat = process.env.BOT_NAME;
    const originalBotPasswordCompat = process.env.BOT_PASSWORD;

    afterEach(() => {
      for (const [key, val] of [
        ["RS_SDK_BOT_NAME", originalBotName],
        ["RS_SDK_BOT_PASSWORD", originalBotPassword],
        ["BOT_NAME", originalBotNameCompat],
        ["BOT_PASSWORD", originalBotPasswordCompat],
      ] as const) {
        if (val !== undefined) {
          process.env[key] = val;
        } else {
          delete process.env[key];
        }
      }
    });

    it("skips plugin registration and returns a warning diagnostic when 2004scape server is unreachable", async () => {
      // Mock fetch to simulate unreachable server
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const manager = new AppManager();
      const pluginManager = buildPluginManager([], RS_2004SCAPE_APP_INFO);
      const runtime = createRuntimeStub({ characterName: "TestAgent" });

      const result = await manager.launch(
        pluginManager,
        "@elizaos/app-2004scape",
        undefined,
        runtime,
      );

      // Plugin registration should NOT have been called (server is down)
      expect(runtime.registerPlugin).not.toHaveBeenCalled();

      // Should include a server-unreachable diagnostic
      const unreachableDiag = result.diagnostics?.find(
        (d: { code: string }) => d.code === "2004scape-server-unreachable",
      );
      expect(unreachableDiag).toBeDefined();
      expect(unreachableDiag?.severity).toBe("warning");
      expect(unreachableDiag?.message).toContain("not running");
      globalThis.fetch = originalFetch;
    });

    it("registers the plugin when 2004scape server IS reachable", async () => {
      // Mock fetch to simulate reachable remote server
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("ok", { status: 200 }));

      try {
        const manager = new AppManager();
        const pluginManager = buildPluginManager([], RS_2004SCAPE_APP_INFO);
        const runtime = createRuntimeStub({ characterName: "TestAgent" });

        const result = await manager.launch(
          pluginManager,
          "@elizaos/app-2004scape",
          undefined,
          runtime,
        );

        // Plugin registration SHOULD have been called
        expect(runtime.registerPlugin).toHaveBeenCalled();

        // Should NOT include a server-unreachable diagnostic
        const unreachableDiag = result.diagnostics?.find(
          (d: { code: string }) => d.code === "2004scape-server-unreachable",
        );
        expect(unreachableDiag).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
