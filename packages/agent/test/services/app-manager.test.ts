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

type AppPackageModuleMocks = {
  importAppPlugin: ReturnType<typeof vi.fn>;
  importAppRouteModule: ReturnType<typeof vi.fn>;
};

type RegistryClientMocks = {
  getPluginInfo: ReturnType<typeof vi.fn>;
  getRegistryPlugins: ReturnType<typeof vi.fn>;
};

var appPackageModuleMocksSingleton: AppPackageModuleMocks | undefined;
var registryClientMocksSingleton: RegistryClientMocks | undefined;

function getAppPackageModuleMocks(): AppPackageModuleMocks {
  if (!appPackageModuleMocksSingleton) {
    appPackageModuleMocksSingleton = {
      importAppPlugin: vi.fn(async (packageName: string) => ({
        name: packageName,
        services: [{ serviceType: "hyperscapeService" }],
      })),
      importAppRouteModule: vi.fn(),
    };
  }
  return appPackageModuleMocksSingleton;
}

function getRegistryClientMocks(): RegistryClientMocks {
  if (!registryClientMocksSingleton) {
    registryClientMocksSingleton = {
      getPluginInfo: vi.fn(async () => null),
      getRegistryPlugins: vi.fn(async () => new Map()),
    };
  }
  return registryClientMocksSingleton;
}

const appPackageModuleMocks = getAppPackageModuleMocks();
const registryClientMocks = getRegistryClientMocks();

vi.mock("../../src/services/app-package-modules", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/services/app-package-modules")
    >();
  const appPackageModuleMocks = getAppPackageModuleMocks();
  return {
    ...actual,
    importAppPlugin: appPackageModuleMocks.importAppPlugin,
    importAppRouteModule:
      appPackageModuleMocks.importAppRouteModule.mockImplementation(
        actual.importAppRouteModule,
      ),
  };
});

vi.mock("../../src/services/registry-client", () => {
  const registryClientMocks = getRegistryClientMocks();
  return {
    getPluginInfo: registryClientMocks.getPluginInfo,
    getRegistryPlugins: registryClientMocks.getRegistryPlugins,
  };
});

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
  name: "@hyperscape/plugin-hyperscape",
  gitRepo: "HyperscapeAI/hyperscape",
  gitUrl: "https://github.com/HyperscapeAI/hyperscape",
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
      hiddenUI: "chat,inventory,minimap,hotbar,stats",
      quality: "medium",
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
    bridgeExport: "./app",
    viewer: {
      url: "{HYPERSCAPE_CLIENT_URL}",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
        followEntity: "{HYPERSCAPE_CHARACTER_ID}",
        hiddenUI: "chat,inventory,minimap,hotbar,stats",
        quality: "medium",
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
    package: "@hyperscape/plugin-hyperscape",
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

const HYPERSCAPE_ALIAS_APP_INFO: RegistryPluginInfo = {
  ...HYPERSCAPE_APP_INFO,
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  runtimePlugin: undefined,
  appMeta: HYPERSCAPE_APP_INFO.appMeta
    ? {
        ...HYPERSCAPE_APP_INFO.appMeta,
        runtimePlugin: "@hyperscape/plugin-hyperscape",
      }
    : undefined,
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
      pluginName: registryPlugin?.name ?? "@hyperscape/plugin-hyperscape",
      version: "1.0.0",
      installPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: registryPlugin?.name ?? "@hyperscape/plugin-hyperscape",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@hyperscape/plugin-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@hyperscape/plugin-hyperscape",
      ejectedPath: "/tmp/hyperscape",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "@hyperscape/plugin-hyperscape",
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
      canSendCommands: true,
      controls: ["pause", "resume"],
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
          availableGoals: [
            {
              description: "Scout the ruins",
              type: "explore",
              reason: "The ruins have the highest value loot nearby.",
            },
          ],
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

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/runtime-agent-id/thoughts"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          thoughts: [
            {
              id: "thought-1",
              type: "reasoning",
              content: "The ruins are the safest high-value route right now.",
              timestamp: 1_710_000_000_500,
            },
          ],
          count: 1,
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
          name: "@hyperscape/plugin-hyperscape",
          version: "1.2.3",
          installedAt: "2026-04-04T12:34:56.000Z",
        },
      ]),
    );

    expect(installed).toEqual([
      expect.objectContaining({
        name: "@hyperscape/plugin-hyperscape",
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
          name: "@hyperscape/plugin-hyperscape",
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
        name: "@hyperscape/plugin-hyperscape",
        launchType: "connect",
        launchUrl: "{HYPERSCAPE_CLIENT_URL}",
        localPath: "/tmp/hyperscape",
        viewer: expect.objectContaining({
          url: "{HYPERSCAPE_CLIENT_URL}",
          postMessageAuth: true,
        }),
        session: expect.objectContaining({
          mode: "spectate-and-steer",
        }),
      }),
    ]);
  });

  it("returns only the curated four games and deduplicates Hyperscape aliases", async () => {
    const defenseAppInfo: RegistryPluginInfo = {
      name: "@elizaos/app-defense-of-the-agents",
      gitRepo: "elizaos/app-defense-of-the-agents",
      gitUrl: "https://github.com/elizaos/app-defense-of-the-agents",
      displayName: "Defense of the Agents",
      description: "Defense lane loop",
      homepage: "https://defense.example",
      topics: ["game"],
      stars: 0,
      language: "TypeScript",
      kind: "app",
      category: "game",
      launchType: "url",
      launchUrl: "https://defense.example",
      capabilities: ["strategy"],
      npm: {
        package: "@elizaos/app-defense-of-the-agents",
        v0Version: null,
        v1Version: "1.0.0",
        v2Version: "1.0.0",
      },
      supports: { v0: false, v1: true, v2: true },
    };
    const unsupportedAppInfo: RegistryPluginInfo = {
      name: "@elizaos/app-hyperfy",
      gitRepo: "elizaos/app-hyperfy",
      gitUrl: "https://github.com/elizaos/app-hyperfy",
      displayName: "Hyperfy",
      description: "Unsupported world",
      homepage: "https://hyperfy.example",
      topics: ["world"],
      stars: 0,
      language: "TypeScript",
      kind: "app",
      category: "world",
      launchType: "url",
      launchUrl: "https://hyperfy.example",
      capabilities: ["exploration"],
      npm: {
        package: "@elizaos/app-hyperfy",
        v0Version: null,
        v1Version: "1.0.0",
        v2Version: "1.0.0",
      },
      supports: { v0: false, v1: true, v2: true },
    };

    registryClientMocks.getRegistryPlugins.mockResolvedValue(
      new Map<string, RegistryPluginInfo>([
        [HYPERSCAPE_APP_INFO.name, HYPERSCAPE_APP_INFO],
        [HYPERSCAPE_ALIAS_APP_INFO.name, HYPERSCAPE_ALIAS_APP_INFO],
        [BABYLON_APP_INFO.name, BABYLON_APP_INFO],
        [RS_2004SCAPE_APP_INFO.name, RS_2004SCAPE_APP_INFO],
        [defenseAppInfo.name, defenseAppInfo],
        [unsupportedAppInfo.name, unsupportedAppInfo],
      ]),
    );

    const pluginManager = buildPluginManager([], null);
    (
      pluginManager.refreshRegistry as ReturnType<typeof vi.fn>
    ).mockResolvedValue(
      new Map<string, RegistryPluginInfo>([
        [HYPERSCAPE_ALIAS_APP_INFO.name, HYPERSCAPE_ALIAS_APP_INFO],
        [BABYLON_APP_INFO.name, BABYLON_APP_INFO],
        [RS_2004SCAPE_APP_INFO.name, RS_2004SCAPE_APP_INFO],
        [defenseAppInfo.name, defenseAppInfo],
        [unsupportedAppInfo.name, unsupportedAppInfo],
      ]),
    );

    const manager = new AppManager();
    const apps = await manager.listAvailable(pluginManager);

    expect(apps.map((app) => app.name)).toEqual([
      "@hyperscape/plugin-hyperscape",
      "@elizaos/app-babylon",
      "@elizaos/app-2004scape",
      "@elizaos/app-defense-of-the-agents",
    ]);
  });

  it("resolves the canonical Hyperscape app info through the alternate package name", async () => {
    const pluginManager = buildPluginManager([], null);
    (
      pluginManager.getRegistryPlugin as ReturnType<typeof vi.fn>
    ).mockImplementation(async (name: string) =>
      name === "@elizaos/app-hyperscape" ? HYPERSCAPE_ALIAS_APP_INFO : null,
    );

    registryClientMocks.getPluginInfo.mockImplementation(
      async (name: string) =>
        name === "@elizaos/app-hyperscape" ? HYPERSCAPE_ALIAS_APP_INFO : null,
    );

    const manager = new AppManager();
    const info = await manager.getInfo(
      pluginManager,
      "@hyperscape/plugin-hyperscape",
    );

    expect(info).not.toBeNull();
    expect(info?.name).toBe("@hyperscape/plugin-hyperscape");
    expect(info?.runtimePlugin).toBe("@hyperscape/plugin-hyperscape");
    expect(info?.displayName).toBe("Hyperscape");
  });

  it("resolves a live Hyperscape session at launch instead of returning a synthetic pending session", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;

    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-plugin-hyperscape-live-"),
    );
    try {
      const manager = new AppManager({ stateDir });
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
        "@hyperscape/plugin-hyperscape",
        undefined,
        runtime,
      );

      expect(runtime.registerPlugin).toHaveBeenCalledTimes(1);
      expect(result.viewer?.url).toBe(
        "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control&followEntity=char-runtime&hiddenUI=chat%2Cinventory%2Cminimap%2Chotbar%2Cstats&quality=medium",
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
      expect(result.session?.telemetry).toEqual(
        expect.objectContaining({
          goalsPaused: false,
          availableGoalCount: 1,
          nearbyLocationCount: 1,
          startedAt: 1_709_999_000_000,
          lastActivity: 1_710_000_000_000,
          recommendedGoals: [
            expect.objectContaining({
              id: "goal-0",
              type: "explore",
              description: "Scout the ruins",
              reason: "The ruins have the highest value loot nearby.",
            }),
          ],
          recentThoughts: [
            expect.objectContaining({
              id: "thought-1",
              type: "reasoning",
              content: "The ruins are the safest high-value route right now.",
              timestamp: 1_710_000_000_500,
            }),
          ],
        }),
      );
      expect(result.run).toEqual(
        expect.objectContaining({
          appName: "@hyperscape/plugin-hyperscape",
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
      fs.rmSync(stateDir, { force: true, recursive: true });
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
        "@hyperscape/plugin-hyperscape",
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
        "@hyperscape/plugin-hyperscape",
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
        if (packageName === "@hyperscape/plugin-hyperscape") {
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
        name: "@hyperscape/plugin-hyperscape",
      } as never);

      const result = await manager.launch(
        buildPluginManager([]),
        "@hyperscape/plugin-hyperscape",
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

  it("drives launch state through generic plugin bridge hooks", async () => {
    const bridgeAppInfo: RegistryPluginInfo = {
      ...HYPERSCAPE_APP_INFO,
      name: "@vendor/plugin-test-app",
      displayName: "Test Bridge App",
      launchUrl: "https://example.com/launch",
      runtimePlugin: "@vendor/plugin-test-app",
      viewer: {
        url: "https://example.com/viewer",
        embedParams: {
          embedded: "true",
        },
        postMessageAuth: true,
        sandbox: "allow-scripts allow-same-origin allow-popups",
      },
      appMeta: {
        displayName: "Test Bridge App",
        category: "game",
        launchType: "connect",
        launchUrl: "https://example.com/launch",
        icon: null,
        capabilities: ["observe"],
        minPlayers: null,
        maxPlayers: null,
        runtimePlugin: "@vendor/plugin-test-app",
        bridgeExport: "./app",
        viewer: {
          url: "https://example.com/viewer",
          embedParams: {
            embedded: "true",
          },
          postMessageAuth: true,
          sandbox: "allow-scripts allow-same-origin allow-popups",
        },
        session: {
          mode: "spectate-and-steer",
          features: ["commands", "pause", "resume"],
        },
      },
      npm: {
        package: "@vendor/plugin-test-app",
        v0Version: null,
        v1Version: "1.0.0",
        v2Version: "1.0.0",
      },
    };
    const prepareLaunch = vi.fn(async () => ({
      diagnostics: [
        {
          code: "bridge-preflight",
          severity: "info" as const,
          message: "bridge preflight complete",
        },
      ],
      launchUrl: "https://prepared.example/launch",
      viewer: {
        url: "https://prepared.example/viewer",
        embedParams: {
          embedded: "true",
          surface: "operator",
        },
        postMessageAuth: true,
        sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
      },
    }));
    const resolveViewerAuthMessage = vi.fn(async () => ({
      type: "TEST_BRIDGE_AUTH",
      authToken: "bridge-token",
      agentId: "runtime-agent-id",
      followEntity: "bridge-follow-entity",
    }));
    const ensureRuntimeReady = vi.fn(async () => undefined);
    const resolveLaunchSession = vi.fn(async () => ({
      sessionId: "bridge-session",
      appName: "@vendor/plugin-test-app",
      mode: "spectate-and-steer" as const,
      status: "running",
      displayName: "Test Bridge App",
      agentId: "runtime-agent-id",
      followEntity: "bridge-follow-entity",
      canSendCommands: true,
      controls: ["pause"] as const,
      summary: "Bridge session attached.",
      goalLabel: "Observe bridge target",
      suggestedPrompts: ["hold position"],
    }));
    const collectLaunchDiagnostics = vi.fn(async () => [
      {
        code: "bridge-runtime",
        severity: "warning" as const,
        message: "bridge runtime note",
      },
    ]);

    appPackageModuleMocks.importAppRouteModule.mockResolvedValue({
      prepareLaunch,
      resolveViewerAuthMessage,
      ensureRuntimeReady,
      resolveLaunchSession,
      collectLaunchDiagnostics,
    });

    const manager = new AppManager();
    const runtime = createRuntimeStub();
    const result = await manager.launch(
      buildPluginManager([], bridgeAppInfo),
      "@vendor/plugin-test-app",
      undefined,
      runtime,
    );

    expect(prepareLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "@vendor/plugin-test-app",
        launchUrl: "https://example.com/launch",
        viewer: null,
      }),
    );
    expect(resolveViewerAuthMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "@vendor/plugin-test-app",
        launchUrl: "https://prepared.example/launch",
        viewer: null,
      }),
    );
    expect(ensureRuntimeReady).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "@vendor/plugin-test-app",
        launchUrl: "https://prepared.example/launch",
        viewer: expect.objectContaining({
          url: "https://prepared.example/viewer?embedded=true&surface=operator&followEntity=bridge-follow-entity",
          postMessageAuth: true,
          authMessage: expect.objectContaining({
            type: "TEST_BRIDGE_AUTH",
            followEntity: "bridge-follow-entity",
          }),
        }),
      }),
    );
    expect(resolveLaunchSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "@vendor/plugin-test-app",
        launchUrl: "https://prepared.example/launch",
      }),
    );
    expect(collectLaunchDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: "@vendor/plugin-test-app",
        launchUrl: "https://prepared.example/launch",
        session: expect.objectContaining({
          sessionId: "bridge-session",
        }),
      }),
    );
    expect(result.viewer).toEqual(
      expect.objectContaining({
        url: "https://prepared.example/viewer?embedded=true&surface=operator&followEntity=bridge-follow-entity",
        postMessageAuth: true,
        authMessage: expect.objectContaining({
          type: "TEST_BRIDGE_AUTH",
          authToken: "bridge-token",
          followEntity: "bridge-follow-entity",
        }),
      }),
    );
    expect(result.launchUrl).toBe("https://prepared.example/launch");
    expect(result.session).toEqual(
      expect.objectContaining({
        sessionId: "bridge-session",
        goalLabel: "Observe bridge target",
      }),
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "bridge-preflight" }),
        expect.objectContaining({ code: "bridge-runtime" }),
      ]),
    );
  });

  it("persists Hyperscape auth settings on the runtime and attaches a timeout signal", async () => {
    delete process.env.HYPERSCAPE_AUTH_TOKEN;
    delete process.env.HYPERSCAPE_CHARACTER_ID;
    process.env.HYPERSCAPE_API_URL = "https://hyperscape.test";
    appPackageModuleMocks.importAppRouteModule.mockResolvedValue({});

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(
          JSON.stringify({
            success: true,
            authToken: "fixture-auth-token",
            characterId: "char-runtime",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub({
        characterName: "Scout",
        agentRecord: {
          walletAddresses: {
            evm: "0x1234567890123456789012345678901234567890",
          },
        },
      }) as IAgentRuntime & {
        getSetting: (key: string) => string | null;
      };

      const result = await manager.launch(
        buildPluginManager([]),
        "@hyperscape/plugin-hyperscape",
        undefined,
        runtime,
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        "https://hyperscape.test/api/agents/wallet-auth",
      );
      expect(runtime.getSetting("HYPERSCAPE_AUTH_TOKEN")).toBe(
        "fixture-auth-token",
      );
      expect(runtime.getSetting("HYPERSCAPE_CHARACTER_ID")).toBe(
        "char-runtime",
      );
      expect(process.env.HYPERSCAPE_AUTH_TOKEN).toBeUndefined();
      expect(process.env.HYPERSCAPE_CHARACTER_ID).toBeUndefined();
      expect(result.viewer?.authMessage).toEqual(
        expect.objectContaining({
          type: "HYPERSCAPE_AUTH",
          authToken: "fixture-auth-token",
          characterId: "char-runtime",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("derives the Hyperscape wallet address from an existing EVM private key", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    appPackageModuleMocks.importAppRouteModule.mockResolvedValue({});

    try {
      const privateKey =
        "0x59c6995e998f97a5a0044976f094538e8d7d8f0d5f7d7d5f5b5c5d5e5f606162";
      const { deriveEvmAddress } = await import("../../src/api/wallet.js");
      const runtime = createRuntimeStub({
        characterName: "Scout",
        settings: {
          EVM_PRIVATE_KEY: privateKey,
        },
      });

      const manager = new AppManager();
      await manager.launch(
        buildPluginManager([]),
        "@hyperscape/plugin-hyperscape",
        undefined,
        runtime,
      );

      expect(fixtureServer.walletAuthRequests).toHaveLength(1);
      expect(fixtureServer.walletAuthRequests[0]?.walletType).toBe("evm");
      expect(fixtureServer.walletAuthRequests[0]?.walletAddress).toBe(
        deriveEvmAddress(privateKey),
      );
    } finally {
      await fixtureServer.close();
    }
  });

  it("does not auto-provision a local wallet for Hyperscape launch when none exists", async () => {
    const fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
    appPackageModuleMocks.importAppRouteModule.mockResolvedValue({});

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
        "@hyperscape/plugin-hyperscape",
        undefined,
        runtime,
      );

      expect(fixtureServer.walletAuthRequests).toHaveLength(0);
      expect(result.viewer?.authMessage).toBeUndefined();
      expect(runtime.getSetting("HYPERSCAPE_AUTH_TOKEN")).toBeNull();
    } finally {
      await fixtureServer.close();
    }
  });

  it("ignores invalid Hyperscape API URLs before issuing wallet auth requests", async () => {
    process.env.HYPERSCAPE_API_URL = "file:///tmp/not-allowed";
    appPackageModuleMocks.importAppRouteModule.mockResolvedValue({});

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

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
        "@hyperscape/plugin-hyperscape",
        undefined,
        runtime,
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.viewer?.authMessage).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("launches Babylon with a real session token and resolved live operator session", async () => {
    const fixtureServer = await startBabylonFixtureServer();
    process.env.BABYLON_API_URL = fixtureServer.url;
    process.env.BABYLON_CLIENT_URL = fixtureServer.url;

    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-app-babylon-live-"),
    );
    try {
      const manager = new AppManager({ stateDir });
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
      fs.rmSync(stateDir, { force: true, recursive: true });
    }
  });

  describe("multi-app control plane", () => {
    it("refreshes multiple persisted app runs through their route modules when listing runs", async () => {
      process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
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
        "@hyperscape/plugin-hyperscape",
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
          appName: "@hyperscape/plugin-hyperscape",
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
        runs.find((run) => run.appName === "@hyperscape/plugin-hyperscape"),
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
            message: expect.stringContaining(
              "Defense loop is holding mid lane.",
            ),
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
      process.env.HYPERSCAPE_CLIENT_URL = "http://localhost:3333";
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
          appName: "@hyperscape/plugin-hyperscape",
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
        "@hyperscape/plugin-hyperscape",
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
            message: expect.stringContaining(
              "Run verification failed: viewer bridge is offline",
            ),
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

    it("auto-provisions 2004scape credentials and mirrors them into legacy keys", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      delete process.env.BOT_NAME;
      delete process.env.BOT_PASSWORD;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("ok", { status: 200 }));

      try {
        const manager = new AppManager();
        const pluginManager = buildPluginManager([], RS_2004SCAPE_APP_INFO);
        const runtime = createRuntimeStub({ characterName: "Scout Bot" });

        const result = await manager.launch(
          pluginManager,
          "@elizaos/app-2004scape",
          undefined,
          runtime,
        );

        const authMessage = result.viewer?.authMessage;
        expect(authMessage?.type).toBe("RS_2004SCAPE_AUTH");
        expect(authMessage?.authToken).toMatch(/^[a-z0-9]+$/);
        expect((authMessage?.authToken ?? "").length).toBeLessThanOrEqual(12);
        expect(authMessage?.authToken).not.toBe("testbot");
        expect((authMessage?.sessionToken ?? "").length).toBeGreaterThan(0);
        expect(result.viewer?.url).toBe("/api/apps/2004scape/viewer");
        expect(result.viewer?.embedParams).toBeUndefined();

        expect(process.env.RS_SDK_BOT_NAME).toBe(authMessage?.authToken);
        expect(process.env.BOT_NAME).toBe(authMessage?.authToken);
        expect(process.env.RS_SDK_BOT_PASSWORD).toBe(authMessage?.sessionToken);
        expect(process.env.BOT_PASSWORD).toBe(authMessage?.sessionToken);
        expect(runtime.getSetting("RS_SDK_BOT_NAME")).toBe(
          authMessage?.authToken,
        );
        expect(runtime.getSetting("BOT_NAME")).toBe(authMessage?.authToken);
        expect(runtime.getSetting("RS_SDK_BOT_PASSWORD")).toBe(
          authMessage?.sessionToken,
        );
        expect(runtime.getSetting("BOT_PASSWORD")).toBe(
          authMessage?.sessionToken,
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("promotes legacy BOT credentials into the RS_SDK launch contract", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      process.env.BOT_NAME = "legacybot";
      process.env.BOT_PASSWORD = "legacy-pass-42";

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("ok", { status: 200 }));

      try {
        const manager = new AppManager();
        const pluginManager = buildPluginManager([], RS_2004SCAPE_APP_INFO);
        const runtime = createRuntimeStub({ characterName: "Scout Bot" });

        const result = await manager.launch(
          pluginManager,
          "@elizaos/app-2004scape",
          undefined,
          runtime,
        );

        const authMessage = result.viewer?.authMessage;
        expect(authMessage).toEqual(
          expect.objectContaining({
            type: "RS_2004SCAPE_AUTH",
            authToken: "legacybot",
            sessionToken: "legacy-pass-42",
          }),
        );
        expect(result.viewer?.url).toBe("/api/apps/2004scape/viewer");
        expect(result.viewer?.embedParams).toBeUndefined();
        expect(process.env.RS_SDK_BOT_NAME).toBe("legacybot");
        expect(process.env.RS_SDK_BOT_PASSWORD).toBe("legacy-pass-42");
        expect(runtime.getSetting("RS_SDK_BOT_NAME")).toBe("legacybot");
        expect(runtime.getSetting("RS_SDK_BOT_PASSWORD")).toBe(
          "legacy-pass-42",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("prefers RS_SDK credentials when legacy BOT credentials drift out of sync", async () => {
      process.env.RS_SDK_BOT_NAME = "stablebot";
      process.env.RS_SDK_BOT_PASSWORD = "stable-pass-42";
      process.env.BOT_NAME = "wrongbot";
      process.env.BOT_PASSWORD = "wrong-pass-42";

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("ok", { status: 200 }));

      try {
        const manager = new AppManager();
        const pluginManager = buildPluginManager([], RS_2004SCAPE_APP_INFO);
        const runtime = createRuntimeStub({ characterName: "Scout Bot" });

        const result = await manager.launch(
          pluginManager,
          "@elizaos/app-2004scape",
          undefined,
          runtime,
        );

        expect(result.viewer?.authMessage).toEqual(
          expect.objectContaining({
            type: "RS_2004SCAPE_AUTH",
            authToken: "stablebot",
            sessionToken: "stable-pass-42",
          }),
        );
        expect(result.viewer?.url).toBe("/api/apps/2004scape/viewer");
        expect(result.viewer?.embedParams).toBeUndefined();
        expect(process.env.BOT_NAME).toBe("stablebot");
        expect(process.env.BOT_PASSWORD).toBe("stable-pass-42");
        expect(runtime.getSetting("BOT_NAME")).toBe("stablebot");
        expect(runtime.getSetting("BOT_PASSWORD")).toBe("stable-pass-42");
      } finally {
        globalThis.fetch = originalFetch;
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

  describe("getInfo", () => {
    it("returns plugin-provided metadata without relying on host overrides", async () => {
      const bareRegistryEntry: RegistryPluginInfo = {
        ...HYPERSCAPE_APP_INFO,
        displayName: "Hyperscape",
        launchType: "connect",
        launchUrl: "{HYPERSCAPE_CLIENT_URL}",
        category: "game",
        capabilities: ["combat"],
        viewer: {
          url: "{HYPERSCAPE_CLIENT_URL}",
          embedParams: {
            embedded: "true",
            mode: "spectator",
            surface: "agent-control",
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
          bridgeExport: "./app",
          viewer: {
            url: "{HYPERSCAPE_CLIENT_URL}",
            embedParams: {
              embedded: "true",
              mode: "spectator",
              surface: "agent-control",
            },
            postMessageAuth: true,
            sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          },
          session: {
            mode: "spectate-and-steer",
            features: [
              "commands",
              "telemetry",
              "pause",
              "resume",
              "suggestions",
            ],
          },
        },
      };

      const manager = new AppManager();
      const pluginManager = buildPluginManager([], bareRegistryEntry);

      registryClientMocks.getPluginInfo.mockResolvedValue(bareRegistryEntry);

      const info = await manager.getInfo(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      expect(info).not.toBeNull();
      expect(info?.displayName).toBe("Hyperscape");
      expect(info?.launchType).toBe("connect");
      expect(info?.appMeta?.bridgeExport).toBe("./app");
    });

    it("returns null for an unknown app", async () => {
      const manager = new AppManager();
      const pluginManager = buildPluginManager([], null);
      registryClientMocks.getPluginInfo.mockResolvedValue(null);

      const info = await manager.getInfo(pluginManager, "nonexistent-app");
      expect(info).toBeNull();
    });

    it("preserves existing appMeta when registry already provides it", async () => {
      const manager = new AppManager();
      const pluginManager = buildPluginManager([], HYPERSCAPE_APP_INFO);
      registryClientMocks.getPluginInfo.mockResolvedValue(HYPERSCAPE_APP_INFO);

      const info = await manager.getInfo(
        pluginManager,
        "@hyperscape/plugin-hyperscape",
      );

      expect(info).not.toBeNull();
      expect(info?.displayName).toBe("Hyperscape");
      expect(info?.launchType).toBe("connect");
    });
  });
});
