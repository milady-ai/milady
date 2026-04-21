import http from "node:http";
import path from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetInMemoryStateForTests } from "../../../../plugins/app-defense-of-the-agents/src/routes";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../../src/services/plugin-manager-types";

const APP_NAME = "@elizaos/app-defense-of-the-agents";
const APP_LOCAL_PATH = path.resolve(
  process.cwd(),
  "plugins/app-defense-of-the-agents",
);

const registryClientMocks = vi.hoisted(() => ({
  getPluginInfo: vi.fn(async () => null),
  getRegistryPlugins: vi.fn(async () => new Map()),
}));

vi.mock("../../src/services/registry-client", () => ({
  getPluginInfo: registryClientMocks.getPluginInfo,
  getRegistryPlugins: registryClientMocks.getRegistryPlugins,
}));

import { AppManager } from "../../src/services/app-manager";

const DEFENSE_APP_INFO: RegistryPluginInfo = {
  name: APP_NAME,
  gitRepo: "milady-ai/milady",
  gitUrl: "https://github.com/milady-ai/milady",
  displayName: "Defense of the Agents",
  description: "Defense of the Agents live session bridge",
  homepage: "https://www.defenseoftheagents.com/",
  topics: ["game", "moba"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  category: "game",
  launchType: "connect",
  launchUrl: "https://www.defenseoftheagents.com/",
  runtimePlugin: APP_NAME,
  capabilities: ["strategy", "telemetry", "lane-control"],
  viewer: {
    url: "/api/apps/defense-of-the-agents/viewer",
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
  session: {
    mode: "spectate-and-steer",
    features: ["commands", "telemetry", "suggestions"],
  },
  appMeta: {
    displayName: "Defense of the Agents",
    category: "game",
    launchType: "connect",
    launchUrl: "https://www.defenseoftheagents.com/",
    icon: null,
    capabilities: ["strategy", "telemetry", "lane-control"],
    minPlayers: null,
    maxPlayers: null,
    runtimePlugin: APP_NAME,
    viewer: {
      url: "/api/apps/defense-of-the-agents/viewer",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "spectate-and-steer",
      features: ["commands", "telemetry", "suggestions"],
    },
  },
  npm: {
    package: APP_NAME,
    v0Version: null,
    v1Version: "0.0.0",
    v2Version: "0.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
};

function buildPluginManager(): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(
      async () => new Map([[DEFENSE_APP_INFO.name, DEFENSE_APP_INFO]]),
    ),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async () => DEFENSE_APP_INFO),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_NAME,
      version: "0.0.0",
      installPath: APP_LOCAL_PATH,
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_NAME,
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_NAME,
      ejectedPath: APP_LOCAL_PATH,
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_NAME,
      ejectedPath: APP_LOCAL_PATH,
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_NAME,
      removedPath: APP_LOCAL_PATH,
      requiresRestart: false,
    })),
  };
}

type RegisterRequest = { agentName?: string };
type DeploymentRequest = {
  authorization?: string;
  body: Record<string, unknown>;
};

type DefenseFixtureServer = {
  close: () => Promise<void>;
  deploymentRequests: DeploymentRequest[];
  registerRequests: RegisterRequest[];
  url: string;
};

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

async function startDefenseFixtureServer(): Promise<DefenseFixtureServer> {
  const deploymentRequests: DeploymentRequest[] = [];
  const registerRequests: RegisterRequest[] = [];

  let deployed = false;
  let hero = {
    name: "Scout",
    faction: "human",
    class: "mage",
    lane: "mid",
    hp: 140,
    maxHp: 140,
    alive: true,
    level: 1,
    xp: 0,
    xpToNext: 200,
    abilities: [] as Array<{ id: string; level: number }>,
    abilityChoices: [] as string[],
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);
    res.setHeader("Content-Type", "application/json");

    if (req.method === "POST" && url.pathname === "/api/agents/register") {
      registerRequests.push({
        agentName:
          typeof body?.agentName === "string" ? body.agentName : undefined,
      });
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          message: "Agent registered successfully. Save your API key!",
          apiKey: "fixture-defense-api-key",
        }),
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/strategy/deployment") {
      deploymentRequests.push({
        authorization: req.headers.authorization,
        body: body ?? {},
      });
      deployed = true;
      hero = {
        ...hero,
        class:
          typeof body?.heroClass === "string"
            ? (body.heroClass as typeof hero.class)
            : hero.class,
        lane:
          typeof body?.heroLane === "string"
            ? (body.heroLane as typeof hero.lane)
            : hero.lane,
      };
      res.statusCode = 200;
      res.end(JSON.stringify({ message: "Deployment received.", gameId: 2 }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/game/state") {
      const gameId = Number.parseInt(url.searchParams.get("game") ?? "1", 10);
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          tick: 4_096,
          agents: {
            human: deployed && gameId === 2 ? ["Scout"] : [],
            orc: ["Enemy"],
          },
          lanes: {
            top: { human: 2, orc: 4, frontline: -12 },
            mid: { human: 3, orc: 3, frontline: 0 },
            bot: { human: 4, orc: 2, frontline: 10 },
          },
          towers: [],
          bases: {
            human: { hp: 1500, maxHp: 1500 },
            orc: { hp: 1500, maxHp: 1500 },
          },
          heroes: deployed && gameId === 2 ? [hero] : [],
          winner: null,
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
    throw new Error("Failed to resolve Defense fixture server address.");
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
    deploymentRequests,
    registerRequests,
    url: `http://127.0.0.1:${address.port}`,
  };
}

function createRuntimeStub(): IAgentRuntime {
  const settings = new Map<string, string>();
  const plugins: Array<{ name: string }> = [];

  return {
    agentId: "runtime-agent-id" as IAgentRuntime["agentId"],
    character: { name: "Scout" } as IAgentRuntime["character"],
    plugins,
    getSetting: (key: string) => settings.get(key) ?? null,
    setSetting: (key: string, value: string | boolean | null) => {
      if (typeof value === "string") {
        settings.set(key, value);
      }
    },
    registerPlugin: vi.fn(async (plugin) => {
      plugins.push({ name: plugin.name });
    }),
  } as unknown as IAgentRuntime;
}

describe("Defense of the Agents launch integration", () => {
  const originalApiUrl = process.env.DEFENSE_OF_THE_AGENTS_API_URL;
  const originalApiKey = process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
  const originalGameId = process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
  const originalAgentName = process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;

  afterEach(() => {
    resetInMemoryStateForTests();

    if (originalApiUrl !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_API_URL = originalApiUrl;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_API_URL;
    }
    if (originalApiKey !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_API_KEY = originalApiKey;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
    }
    if (originalGameId !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_GAME_ID = originalGameId;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
    }
    if (originalAgentName !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME = originalAgentName;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;
    }

    registryClientMocks.getPluginInfo.mockReset();
    registryClientMocks.getRegistryPlugins.mockReset();
    registryClientMocks.getRegistryPlugins.mockResolvedValue(new Map());
    vi.restoreAllMocks();
  });

  it("auto-registers, deploys, and returns a live Defense session on launch", async () => {
    const fixtureServer = await startDefenseFixtureServer();
    registryClientMocks.getPluginInfo.mockResolvedValue({
      ...DEFENSE_APP_INFO,
      localPath: APP_LOCAL_PATH,
    });
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = fixtureServer.url;
    delete process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
    delete process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
    delete process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;

    try {
      const manager = new AppManager();
      const runtime = createRuntimeStub();
      const result = await manager.launch(
        buildPluginManager(),
        APP_NAME,
        undefined,
        runtime,
      );

      expect(runtime.registerPlugin).toHaveBeenCalledTimes(1);
      expect(result.viewer).toEqual(
        expect.objectContaining({
          url: "/api/apps/defense-of-the-agents/viewer",
          postMessageAuth: false,
        }),
      );
      expect(fixtureServer.registerRequests).toEqual([{ agentName: "Scout" }]);
      expect(fixtureServer.deploymentRequests).toEqual([
        {
          authorization: "Bearer fixture-defense-api-key",
          body: {
            heroClass: "mage",
            heroLane: "mid",
          },
        },
      ]);
      expect(result.session).toEqual(
        expect.objectContaining({
          sessionId: "Scout",
          appName: APP_NAME,
          mode: "spectate-and-steer",
          status: "running",
          canSendCommands: true,
          telemetry: expect.objectContaining({
            gameId: 2,
            heroClass: "mage",
            heroLane: "mid",
          }),
        }),
      );
      expect(process.env.DEFENSE_OF_THE_AGENTS_API_KEY).toBe(
        "fixture-defense-api-key",
      );
      expect(process.env.DEFENSE_OF_THE_AGENTS_GAME_ID).toBe("2");
      expect(process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME).toBe("Scout");
    } finally {
      await fixtureServer.close();
    }
  });

  it("returns a degraded session instead of throwing when the Defense API is unavailable", async () => {
    registryClientMocks.getPluginInfo.mockResolvedValue({
      ...DEFENSE_APP_INFO,
      localPath: APP_LOCAL_PATH,
    });
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = "http://127.0.0.1:1";
    delete process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
    delete process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
    delete process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;

    const manager = new AppManager();
    const runtime = createRuntimeStub();
    const result = await manager.launch(
      buildPluginManager(),
      APP_NAME,
      undefined,
      runtime,
    );

    expect(runtime.registerPlugin).toHaveBeenCalledTimes(1);
    expect(result.viewer).toEqual(
      expect.objectContaining({
        url: "/api/apps/defense-of-the-agents/viewer",
        postMessageAuth: false,
      }),
    );
    expect(result.session).toEqual(
      expect.objectContaining({
        sessionId: "Scout",
        appName: APP_NAME,
        status: "degraded",
        canSendCommands: false,
      }),
    );
    expect(result.session?.summary).toContain(
      "Defense control API unavailable",
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "defense-control-api-unavailable",
        severity: "warning",
      }),
    );
  });
});
