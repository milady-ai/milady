import http from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";
import { handleAppPackageRoutes } from "../../src/api/app-package-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const hyperscapeLocalPathUrl = new URL(
  "../../../../../hyperscape/packages/plugin-hyperscape/",
  import.meta.url,
);
const HYPERSCAPE_LOCAL_PATH = fileURLToPath(hyperscapeLocalPathUrl);
const hasLocalHyperscapeRoutes = existsSync(
  new URL("src/app.ts", hyperscapeLocalPathUrl),
);

vi.mock("../../src/services/registry-client.js", () => ({
  getPluginInfo: vi.fn(async () => ({
    name: "@hyperscape/plugin-hyperscape",
    localPath: hasLocalHyperscapeRoutes ? HYPERSCAPE_LOCAL_PATH : null,
  })),
}));

type HyperscapeFixtureServer = {
  close: () => Promise<void>;
  receivedCommands: Array<{ path: string; body: unknown }>;
  url: string;
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
  let goalsPaused = false;
  const receivedCommands: Array<{ path: string; body: unknown }> = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJsonBody(req);

    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && url.pathname === "/api/embedded-agents") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          agents: [
            {
              agentId: "agent-1",
              characterId: "char-1",
              name: "Scout",
              state: "running",
              entityId: "char-1",
              lastActivity: 1712265600,
              startedAt: 1712262000,
            },
          ],
        }),
      );
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/pause"
    ) {
      goalsPaused = true;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goals paused" }));
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/resume"
    ) {
      goalsPaused = false;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goals resumed" }));
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/embedded-agents/char-1/command"
    ) {
      receivedCommands.push({ path: url.pathname, body });
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Command delivered" }));
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
          agentName: "Chen",
        }),
      );
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/message"
    ) {
      receivedCommands.push({ path: url.pathname, body });
      res.statusCode = 200;
      res.end(
        JSON.stringify({ success: true, message: "Message sent to agent" }),
      );
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/goal/stop"
    ) {
      goalsPaused = true;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goal stopped" }));
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/agents/runtime-agent-id/goal/resume"
    ) {
      goalsPaused = false;
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, message: "Goal resumed" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/agents/agent-1/goal") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          goal: goalsPaused ? null : { description: "Scout the ruins" },
          goalsPaused,
          availableGoals: [
            { description: "Scout the ruins", type: "explore" },
            { description: "Chop nearby tree", type: "gather" },
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
          goal: goalsPaused ? null : { description: "Investigate the ruins" },
          goalsPaused,
          availableGoals: [
            { description: "Investigate the ruins", type: "explore" },
            { description: "Gather wood", type: "gather" },
          ],
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/api/agents/agent-1/quick-actions"
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          quickCommands: [
            {
              label: "Scout",
              command: goalsPaused ? "resume exploration" : "scan nearby ruins",
              available: true,
            },
          ],
          nearbyLocations: [{ name: "Ruins" }, { name: "Forest" }],
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
            {
              label: "Explore",
              command: goalsPaused ? "resume exploring" : "check the ruins",
              available: true,
            },
          ],
          nearbyLocations: [{ name: "Ruins" }, { name: "Town" }],
          playerPosition: [12, 0, 18],
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: `Unhandled route: ${req.method} ${url.pathname}`,
      }),
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
    receivedCommands,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describeIf(hasLocalHyperscapeRoutes)("handleAppPackageRoutes", () => {
  let fixtureServer: HyperscapeFixtureServer | null = null;
  const originalApiUrl = process.env.HYPERSCAPE_API_URL;

  beforeEach(async () => {
    fixtureServer = await startHyperscapeFixtureServer();
    process.env.HYPERSCAPE_API_URL = fixtureServer.url;
  });

  afterEach(async () => {
    if (fixtureServer) {
      await fixtureServer.close();
      fixtureServer = null;
    }
    if (originalApiUrl !== undefined) {
      process.env.HYPERSCAPE_API_URL = originalApiUrl;
    } else {
      delete process.env.HYPERSCAPE_API_URL;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("does not route reserved app slugs like /api/apps/runs through package handlers", async () => {
    const { res } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/runs/run-1",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/runs/run-1",
      url: new URL("http://localhost:2138/api/apps/runs/run-1"),
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

    expect(handled).toBe(false);
  });

  test("loads local app package routes and returns live session state", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/hyperscape/session/agent-1",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/hyperscape/session/agent-1",
      url: new URL("http://localhost:2138/api/apps/hyperscape/session/agent-1"),
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
        sessionId: "agent-1",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        goalLabel: "Scout the ruins",
        suggestedPrompts: ["scan nearby ruins"],
        telemetry: expect.objectContaining({
          nearbyLocationCount: 2,
          availableGoalCount: 2,
        }),
      }),
    );
  });

  test("session messages go upstream and return a refreshed session snapshot", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/agent-1/message",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/agent-1/message",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/agent-1/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "scan the area" })),
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
    expect(fixtureServer?.receivedCommands).toEqual([
      {
        path: "/api/embedded-agents/char-1/command",
        body: {
          command: "chat",
          data: { message: "scan the area" },
        },
      },
    ]);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Command delivered",
        session: expect.objectContaining({
          sessionId: "agent-1",
          suggestedPrompts: ["scan nearby ruins"],
        }),
      }),
    );
  });

  test("session control actions return a refreshed state instead of synthetic placeholders", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/agent-1/control",
      }),
      res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/agent-1/control",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/agent-1/control",
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
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Goals paused",
        session: expect.objectContaining({
          sessionId: "agent-1",
          status: "paused",
          controls: ["resume"],
          goalLabel: "Goals paused",
          suggestedPrompts: ["resume exploration"],
          telemetry: expect.objectContaining({
            goalsPaused: true,
            nearbyLocationCount: 2,
            availableGoalCount: 2,
          }),
        }),
      }),
    );
  });

  test("returns 400 for invalid session message and control payloads", async () => {
    const emptyMessage = createMockHttpResponse();
    const emptyMessageHandled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/agent-1/message",
      }),
      res: emptyMessage.res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/agent-1/message",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/agent-1/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "   " })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(emptyMessageHandled).toBe(true);
    expect(emptyMessage.getStatus()).toBe(400);
    expect(emptyMessage.getJson()).toEqual({ error: "content is required" });
    expect(fixtureServer?.receivedCommands).toEqual([]);

    const invalidControl = createMockHttpResponse();
    const invalidControlHandled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/agent-1/control",
      }),
      res: invalidControl.res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/agent-1/control",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/agent-1/control",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ action: "rewind" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(invalidControlHandled).toBe(true);
    expect(invalidControl.getStatus()).toBe(400);
    expect(invalidControl.getJson()).toEqual({
      error: "action must be pause or resume",
    });
  });

  test("returns 404 when the requested session cannot be resolved", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/hyperscape/session/unknown-session",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/hyperscape/session/unknown-session",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/unknown-session",
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
    expect(getStatus()).toBe(404);
    expect(getJson()).toEqual({ error: "Hyperscape session not found" });
  });

  test("mapped external agents resolve to live session state and use agent routes for controls", async () => {
    const { res, getJson, getStatus } = createMockHttpResponse();
    const handled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "GET",
        url: "/api/apps/hyperscape/session/runtime-agent-id",
      }),
      res,
      method: "GET",
      pathname: "/api/apps/hyperscape/session/runtime-agent-id",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/runtime-agent-id",
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
        sessionId: "runtime-agent-id",
        status: "running",
        agentId: "runtime-agent-id",
        characterId: "char-runtime",
        followEntity: "char-runtime",
        suggestedPrompts: ["check the ruins"],
      }),
    );

    const controlResponse = createMockHttpResponse();
    const controlHandled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/runtime-agent-id/control",
      }),
      res: controlResponse.res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/runtime-agent-id/control",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/runtime-agent-id/control",
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

    expect(controlHandled).toBe(true);
    expect(controlResponse.getStatus()).toBe(200);
    expect(controlResponse.getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Goal stopped",
        session: expect.objectContaining({
          sessionId: "runtime-agent-id",
          status: "paused",
          controls: ["resume"],
          suggestedPrompts: ["resume exploring"],
        }),
      }),
    );

    const messageResponse = createMockHttpResponse();
    const messageHandled = await handleAppPackageRoutes({
      req: createMockIncomingMessage({
        method: "POST",
        url: "/api/apps/hyperscape/session/runtime-agent-id/message",
      }),
      res: messageResponse.res,
      method: "POST",
      pathname: "/api/apps/hyperscape/session/runtime-agent-id/message",
      url: new URL(
        "http://localhost:2138/api/apps/hyperscape/session/runtime-agent-id/message",
      ),
      runtime: null,
      readJsonBody: vi.fn(async () => ({ content: "head to the ruins" })),
      json: (response, data, status = 200) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
      error: (response, message, status = 500) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    });

    expect(messageHandled).toBe(true);
    expect(messageResponse.getStatus()).toBe(200);
    expect(fixtureServer?.receivedCommands).toEqual(
      expect.arrayContaining([
        {
          path: "/api/agents/runtime-agent-id/message",
          body: {
            content: "head to the ruins",
          },
        },
      ]),
    );
    expect(messageResponse.getJson()).toEqual(
      expect.objectContaining({
        success: true,
        message: "Message sent to agent",
      }),
    );
  });
});
