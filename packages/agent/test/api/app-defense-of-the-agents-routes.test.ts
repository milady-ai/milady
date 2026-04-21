import http from "node:http";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetInMemoryStateForTests } from "../../../../plugins/app-defense-of-the-agents/src/routes";
import { handleAppPackageRoutes } from "../../src/api/app-package-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const DEFENSE_APP_LOCAL_PATH = path.resolve(
  process.cwd(),
  "plugins/app-defense-of-the-agents",
);

vi.mock("../../src/services/registry-client.js", () => ({
  getPluginInfo: vi.fn(async () => ({
    name: "@elizaos/app-defense-of-the-agents",
    localPath: DEFENSE_APP_LOCAL_PATH,
  })),
}));

type DeploymentRequest = {
  authorization?: string;
  body: Record<string, unknown>;
};

type DefenseFixtureServer = {
  close: () => Promise<void>;
  deploymentRequests: DeploymentRequest[];
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

  let hero = {
    name: "Scout",
    faction: "human",
    class: "mage",
    lane: "mid",
    hp: 132,
    maxHp: 200,
    alive: true,
    level: 3,
    xp: 50,
    xpToNext: 400,
    abilities: [{ id: "tornado", level: 1 }],
    abilityChoices: ["fireball", "fortitude"],
  };

  const gameState = (gameId: number) => ({
    tick: 2_048,
    agents: {
      human: gameId === 2 ? ["Scout", "Ally"] : ["Ally"],
      orc: ["Enemy"],
    },
    lanes: {
      top: { human: 3, orc: 5, frontline: -18 },
      mid: { human: 4, orc: 4, frontline: 0 },
      bot: { human: 5, orc: 3, frontline: 12 },
    },
    towers: [
      { faction: "human", lane: "top", hp: 900, maxHp: 1200, alive: true },
      { faction: "orc", lane: "top", hp: 600, maxHp: 1200, alive: true },
    ],
    bases: {
      human: { hp: 1400, maxHp: 1500 },
      orc: { hp: 1500, maxHp: 1500 },
    },
    heroes: gameId === 2 ? [hero] : [],
    winner: null,
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);

    if (req.method === "GET" && url.pathname === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.statusCode = 200;
      res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/styles.css" />
    <style>
      @font-face {
        font-family: "Fixture";
        src: url("/fonts/fixture.woff2") format("woff2");
      }
    </style>
  </head>
  <body>
    <div id="landing-overlay">Landing</div>
    <div id="auth-modal" class="modal-overlay open">Auth</div>
    <div id="class-modal" class="modal-overlay open">Class</div>
    <div id="join-btn">Join</div>
    <img src="/hero.png" />
    <script src="/app.js"></script>
  </body>
</html>`);
      return;
    }

    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && url.pathname === "/api/game/state") {
      const gameId = Number.parseInt(url.searchParams.get("game") ?? "1", 10);
      res.statusCode = 200;
      res.end(JSON.stringify(gameState(gameId)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/strategy/deployment") {
      deploymentRequests.push({
        authorization: req.headers.authorization,
        body: body ?? {},
      });

      if (typeof body?.heroLane === "string") {
        hero = { ...hero, lane: body.heroLane as typeof hero.lane };
      }
      if (typeof body?.heroClass === "string") {
        hero = { ...hero, class: body.heroClass as typeof hero.class };
      }
      if (typeof body?.abilityChoice === "string") {
        hero = {
          ...hero,
          abilityChoices: hero.abilityChoices.filter(
            (choice) => choice !== body.abilityChoice,
          ),
          abilities: [
            ...hero.abilities,
            {
              id: body.abilityChoice,
              level: 1,
            },
          ],
        };
      }

      res.statusCode = 200;
      res.end(JSON.stringify({ message: "Deployment received.", gameId: 2 }));
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
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("Defense of the Agents app routes", () => {
  let fixtureServer: DefenseFixtureServer | null = null;
  const originalApiUrl = process.env.DEFENSE_OF_THE_AGENTS_API_URL;
  const originalApiKey = process.env.DEFENSE_OF_THE_AGENTS_API_KEY;
  const originalGameId = process.env.DEFENSE_OF_THE_AGENTS_GAME_ID;
  const originalAgentName = process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME;
  const originalViewerUrl = process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL;

  beforeEach(async () => {
    fixtureServer = await startDefenseFixtureServer();
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = fixtureServer.url;
    process.env.DEFENSE_OF_THE_AGENTS_API_KEY = "fixture-defense-api-key";
    process.env.DEFENSE_OF_THE_AGENTS_GAME_ID = "2";
    process.env.DEFENSE_OF_THE_AGENTS_AGENT_NAME = "Scout";
    process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL = fixtureServer.url;
  });

  afterEach(async () => {
    resetInMemoryStateForTests();

    if (fixtureServer) {
      await fixtureServer.close();
      fixtureServer = null;
    }

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
    if (originalViewerUrl !== undefined) {
      process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL = originalViewerUrl;
    } else {
      delete process.env.DEFENSE_OF_THE_AGENTS_VIEWER_URL;
    }

    vi.restoreAllMocks();
  });

  test("returns live session state for the tracked Defense hero", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/defense-of-the-agents/session/Scout",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/defense-of-the-agents/session/Scout",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => null),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        sessionId: "Scout",
        appName: "@elizaos/app-defense-of-the-agents",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        goalLabel: "Choose an ability for Scout",
        suggestedPrompts: expect.arrayContaining([
          "Move to top lane",
          "Learn Fireball",
        ]),
        telemetry: expect.objectContaining({
          gameId: 2,
          heroClass: "mage",
          heroLane: "mid",
          heroAbilityChoices: 2,
        }),
      }),
    );
  });

  test("serves a Milady spectator shell instead of the raw Defense site", async () => {
    const { res } = createMockHttpResponse();
    const chunks: string[] = [];
    const headers = new Map<string, string>();
    res.setHeader = ((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
    }) as typeof res.setHeader;
    (
      res as typeof res & { getHeader: (name: string) => string | undefined }
    ).getHeader = ((name: string) => headers.get(name.toLowerCase())) as (
      name: string,
    ) => string | undefined;
    (
      res as typeof res & { removeHeader: (name: string) => void }
    ).removeHeader = ((name: string) => {
      headers.delete(name.toLowerCase());
    }) as (name: string) => void;
    res.end = ((chunk?: string | Buffer) => {
      chunks.push(chunk ? chunk.toString() : "");
    }) as typeof res.end;

    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/defense-of-the-agents/viewer",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/defense-of-the-agents/viewer",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/viewer",
      ),
      runtime: {
        character: { name: "Scout" },
        getSetting: (key: string) => {
          if (key === "DEFENSE_OF_THE_AGENTS_AGENT_NAME") {
            return "Scout";
          }
          return null;
        },
      },
      readJsonBody: vi.fn(async () => null),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(headers.get("x-frame-options")).toBeUndefined();
    expect(headers.get("content-security-policy")).toContain("frame-ancestors");
    expect(headers.get("content-security-policy")).toContain(
      "http://127.0.0.1:*",
    );

    const html = chunks.join("");
    expect(html).toContain("milady-defense-embedded-style");
    expect(html).toContain("milady-defense-spectator-banner");
    expect(html).toContain(fixtureServer?.url ?? "");
    expect(html).toContain(
      '<base id="milady-defense-viewer-base" href="' +
        (fixtureServer?.url ?? "") +
        '/">',
    );
    expect(html).toContain(`href="${fixtureServer?.url ?? ""}/styles.css"`);
    expect(html).toContain(`src="${fixtureServer?.url ?? ""}/hero.png"`);
    expect(html).toContain(
      `url("${fixtureServer?.url ?? ""}/fonts/fixture.woff2")`,
    );
    expect(html).toContain('const agentName = "Scout"');
    expect(html).toContain("let observerApplying = false;");
    expect(html).toContain("scheduleEmbeddedViewerMode");
  });

  test("message commands translate into deployments and return a refreshed session", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({
        content: "Move to top lane and learn fireball",
      })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(fixtureServer?.deploymentRequests).toEqual([
      {
        authorization: "Bearer fixture-defense-api-key",
        body: {
          heroClass: "mage",
          heroLane: "top",
          abilityChoice: "fireball",
        },
      },
    ]);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Deployment received.",
        session: expect.objectContaining({
          sessionId: "Scout",
          status: "running",
          goalLabel: "Choose an ability for Scout",
          telemetry: expect.objectContaining({
            heroLane: "top",
            heroAbilityChoices: 1,
          }),
        }),
      }),
    );
  });

  test("control routes fail loudly because the remote API has no pause or resume surface", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/control",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/control",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/control",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ action: "pause" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Defense of the Agents does not expose pause or resume controls.",
    });
  });

  test("message with empty content returns 400", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Command content is required.",
    });
  });

  test("message with null body returns 400", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => null),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Command content is required.",
    });
  });

  test("structured JSON deployments are parsed and forwarded", async () => {
    const { res, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({
        content: JSON.stringify({
          heroClass: "ranged",
          heroLane: "bot",
          action: "recall",
        }),
      })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(fixtureServer?.deploymentRequests).toEqual([
      {
        authorization: "Bearer fixture-defense-api-key",
        body: {
          heroClass: "ranged",
          heroLane: "bot",
          action: "recall",
        },
      },
    ]);
  });

  test("recall command is detected from natural language", async () => {
    const { res, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({
        content: "recall to base",
      })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(fixtureServer?.deploymentRequests[0]?.body).toEqual(
      expect.objectContaining({
        action: "recall",
      }),
    );
  });

  test("API errors are surfaced as 502 with a descriptive message", async () => {
    // Point at a non-existent server to trigger a network error
    const savedUrl = process.env.DEFENSE_OF_THE_AGENTS_API_URL;
    process.env.DEFENSE_OF_THE_AGENTS_API_URL = "http://127.0.0.1:1";

    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/defense-of-the-agents/session/Scout",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/defense-of-the-agents/session/Scout",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => null),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    process.env.DEFENSE_OF_THE_AGENTS_API_URL = savedUrl;

    expect(handled).toBe(true);
    expect(getStatus()).toBe(502);
    const body = getJson();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("auto-play ON command starts the game loop and returns updated session", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "Auto-play ON" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining("Auto-play enabled"),
      }),
    );
  });

  test("auto-play OFF command returns confirmation", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "Auto-play OFF" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining("Auto-play disabled"),
      }),
    );
  });

  test("strategy update via JSON is accepted and returns new version", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/defense-of-the-agents/session/Scout/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/defense-of-the-agents/session/Scout/message",
      url: new URL(
        "http://localhost:2138/api/apps/defense-of-the-agents/session/Scout/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({
        content: JSON.stringify({
          strategy: {
            heroClass: "melee",
            preferredLane: "top",
            recallThreshold: 0.3,
          },
        }),
      })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/Strategy updated to v\d+/),
      }),
    );
  });
});

describe("Defense of the Agents strategy functions", async () => {
  const {
    DEFAULT_STRATEGY,
    scoreStrategy,
    pickAbility,
    findWeakestAlliedLane,
    parseStrategyUpdate,
    buildReviewSummary,
    updateMetrics,
  } = await import("../../../../plugins/app-defense-of-the-agents/src/routes");

  test("scoreStrategy returns 0 for empty metrics", () => {
    expect(
      scoreStrategy({ ...DEFAULT_STRATEGY.metrics, ticksTracked: 0 }),
    ).toBe(0);
  });

  test("scoreStrategy rewards survival, level gain, and lane control", () => {
    const good = scoreStrategy({
      ticksTracked: 100,
      ticksAlive: 90,
      levelStart: 1,
      levelEnd: 6,
      abilitiesLearned: 3,
      laneControlSum: 200,
      lastReviewedAt: 0,
    });
    const bad = scoreStrategy({
      ticksTracked: 100,
      ticksAlive: 20,
      levelStart: 1,
      levelEnd: 2,
      abilitiesLearned: 0,
      laneControlSum: -300,
      lastReviewedAt: 0,
    });
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(0.5);
    expect(bad).toBeLessThan(0.3);
  });

  test("pickAbility selects first matching priority", () => {
    expect(
      pickAbility(["fortitude", "fireball"], ["fireball", "fortitude"]),
    ).toBe("fireball");
    expect(
      pickAbility(["fortitude", "tornado"], ["fireball", "fortitude"]),
    ).toBe("fortitude");
  });

  test("pickAbility falls back to first choice when no priority matches", () => {
    expect(pickAbility(["cleave", "thorns"], ["fireball", "tornado"])).toBe(
      "cleave",
    );
  });

  test("findWeakestAlliedLane returns lane with worst allied differential", () => {
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 2, orc: 8, frontline: -20 },
        mid: { human: 5, orc: 5, frontline: 0 },
        bot: { human: 7, orc: 3, frontline: 15 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [],
      winner: null,
    };
    expect(findWeakestAlliedLane(state, "human")).toBe("top");
    expect(findWeakestAlliedLane(state, "orc")).toBe("bot");
  });

  test("parseStrategyUpdate requires explicit strategy key", () => {
    const current = { ...DEFAULT_STRATEGY };
    // Regular deployment JSON should NOT be parsed as strategy
    expect(
      parseStrategyUpdate('{"heroClass":"ranged","heroLane":"bot"}', current),
    ).toBeNull();
    // Strategy key required
    const result = parseStrategyUpdate(
      '{"strategy":{"heroClass":"melee","recallThreshold":0.4}}',
      current,
    );
    expect(result).not.toBeNull();
    expect(result?.heroClass).toBe("melee");
    expect(result?.recallThreshold).toBe(0.4);
    expect(result?.version).toBe(current.version + 1);
  });

  test("parseStrategyUpdate clamps recallThreshold to [0, 1]", () => {
    const current = { ...DEFAULT_STRATEGY };
    const high = parseStrategyUpdate(
      '{"strategy":{"recallThreshold":5}}',
      current,
    );
    expect(high?.recallThreshold).toBe(1);
    const low = parseStrategyUpdate(
      '{"strategy":{"recallThreshold":-1}}',
      current,
    );
    expect(low?.recallThreshold).toBe(0);
  });

  test("buildReviewSummary includes strategy version and metrics", () => {
    const current = {
      ...DEFAULT_STRATEGY,
      version: 3,
      metrics: {
        ticksTracked: 60,
        ticksAlive: 48,
        levelStart: 1,
        levelEnd: 4,
        abilitiesLearned: 2,
        laneControlSum: 120,
        lastReviewedAt: 0,
      },
    };
    const review = buildReviewSummary(current, null);
    expect(review).toContain("v3");
    expect(review).toContain("80%");
    expect(review).toContain("score=");
  });

  test("buildReviewSummary compares against best strategy", () => {
    const current = {
      ...DEFAULT_STRATEGY,
      version: 3,
      metrics: {
        ticksTracked: 60,
        ticksAlive: 48,
        levelStart: 1,
        levelEnd: 4,
        abilitiesLearned: 2,
        laneControlSum: 120,
        lastReviewedAt: 0,
      },
    };
    const best = {
      ...DEFAULT_STRATEGY,
      version: 2,
      metrics: {
        ticksTracked: 60,
        ticksAlive: 30,
        levelStart: 1,
        levelEnd: 2,
        abilitiesLearned: 1,
        laneControlSum: -60,
        lastReviewedAt: 0,
      },
    };
    const review = buildReviewSummary(current, best);
    expect(review).toContain("BEATS best");
  });

  test("updateMetrics increments ticksTracked and ticksAlive when hero is alive", () => {
    const strategy = {
      ...DEFAULT_STRATEGY,
      metrics: { ...DEFAULT_STRATEGY.metrics, ticksTracked: 0, ticksAlive: 0 },
    };
    const hero = {
      name: "Scout",
      faction: "human",
      class: "mage" as const,
      lane: "mid" as const,
      hp: 100,
      maxHp: 200,
      alive: true,
      level: 3,
      xp: 50,
      xpToNext: 400,
      abilities: [],
      abilityChoices: [],
    };
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 3, orc: 5, frontline: -10 },
        mid: { human: 4, orc: 4, frontline: 0 },
        bot: { human: 5, orc: 3, frontline: 10 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [hero],
      winner: null,
    };
    updateMetrics(strategy, hero, state);
    expect(strategy.metrics.ticksTracked).toBe(1);
    expect(strategy.metrics.ticksAlive).toBe(1);
    expect(strategy.metrics.laneControlSum).toBe(0); // mid is even (4v4)
  });

  test("updateMetrics does not increment ticksAlive when hero is dead", () => {
    const strategy = {
      ...DEFAULT_STRATEGY,
      metrics: { ...DEFAULT_STRATEGY.metrics, ticksTracked: 0, ticksAlive: 0 },
    };
    const hero = {
      name: "Scout",
      faction: "human",
      class: "mage" as const,
      lane: "mid" as const,
      hp: 0,
      maxHp: 200,
      alive: false,
      level: 3,
      xp: 50,
      xpToNext: 400,
      abilities: [],
      abilityChoices: [],
    };
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 3, orc: 5, frontline: -10 },
        mid: { human: 4, orc: 4, frontline: 0 },
        bot: { human: 5, orc: 3, frontline: 10 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [hero],
      winner: null,
    };
    updateMetrics(strategy, hero, state);
    expect(strategy.metrics.ticksTracked).toBe(1);
    expect(strategy.metrics.ticksAlive).toBe(0);
  });

  test("updateMetrics increments abilitiesLearned for combined ability+recall action", () => {
    const strategy = {
      ...DEFAULT_STRATEGY,
      metrics: { ...DEFAULT_STRATEGY.metrics, abilitiesLearned: 0 },
    };
    const hero = {
      name: "Scout",
      faction: "human",
      class: "mage" as const,
      lane: "mid" as const,
      hp: 30,
      maxHp: 200,
      alive: true,
      level: 3,
      xp: 50,
      xpToNext: 400,
      abilities: [],
      abilityChoices: [],
    };
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 3, orc: 5, frontline: -10 },
        mid: { human: 4, orc: 4, frontline: 0 },
        bot: { human: 5, orc: 3, frontline: 10 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [hero],
      winner: null,
    };
    updateMetrics(strategy, hero, state, "ability+recall");
    expect(strategy.metrics.abilitiesLearned).toBe(1);
  });

  test("updateMetrics increments abilitiesLearned when action is ability pick", () => {
    const strategy = {
      ...DEFAULT_STRATEGY,
      metrics: { ...DEFAULT_STRATEGY.metrics, abilitiesLearned: 0 },
    };
    const hero = {
      name: "Scout",
      faction: "human",
      class: "mage" as const,
      lane: "mid" as const,
      hp: 100,
      maxHp: 200,
      alive: true,
      level: 3,
      xp: 50,
      xpToNext: 400,
      abilities: [],
      abilityChoices: [],
    };
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 3, orc: 5, frontline: -10 },
        mid: { human: 4, orc: 4, frontline: 0 },
        bot: { human: 5, orc: 3, frontline: 10 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [hero],
      winner: null,
    };
    updateMetrics(strategy, hero, state, "ability:fireball");
    expect(strategy.metrics.abilitiesLearned).toBe(1);
    updateMetrics(strategy, hero, state, "hold");
    expect(strategy.metrics.abilitiesLearned).toBe(1); // not incremented for hold
    updateMetrics(strategy, hero, state, "ability:tornado");
    expect(strategy.metrics.abilitiesLearned).toBe(2);
  });

  test("updateMetrics tracks levelEnd as max of current and hero level", () => {
    const strategy = {
      ...DEFAULT_STRATEGY,
      metrics: { ...DEFAULT_STRATEGY.metrics, levelStart: 1, levelEnd: 3 },
    };
    const hero = {
      name: "Scout",
      faction: "human",
      class: "mage" as const,
      lane: "mid" as const,
      hp: 100,
      maxHp: 200,
      alive: true,
      level: 5,
      xp: 50,
      xpToNext: 400,
      abilities: [],
      abilityChoices: [],
    };
    const state = {
      tick: 100,
      agents: { human: [], orc: [] },
      lanes: {
        top: { human: 3, orc: 5, frontline: -10 },
        mid: { human: 6, orc: 2, frontline: 15 },
        bot: { human: 5, orc: 3, frontline: 10 },
      },
      towers: [],
      bases: {
        human: { hp: 1500, maxHp: 1500 },
        orc: { hp: 1500, maxHp: 1500 },
      },
      heroes: [hero],
      winner: null,
    };
    updateMetrics(strategy, hero, state);
    expect(strategy.metrics.levelEnd).toBe(5);
    expect(strategy.metrics.laneControlSum).toBe(4); // mid: 6-2 = 4
  });
});
