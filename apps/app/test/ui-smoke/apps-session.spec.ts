import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { packageNameToAppRouteSlug } from "@miladyai/shared/contracts/apps";
import { expect, type Page, test } from "@playwright/test";
import { WebSocketServer } from "ws";
import { installDefaultAppMocks, openAppPath, seedAppStorage } from "./helpers";

const SESSION_ID = "session-123";
const VIEWER_PATH = "/viewer/hyperscape";

type FixtureState = {
  launchRequestName: string | null;
  lastCommand: string | null;
  lastControlAction: string | null;
  runPollCount: number;
  sessionPollCount: number;
  unexpectedRequests: string[];
  chatMessages?: Array<{
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    createdAt: string;
  }>;
  sessionState: {
    sessionId: string;
    appName: string;
    mode: "spectate-and-steer";
    status: string;
    displayName: string;
    agentId: string | null;
    characterId: string | null;
    followEntity: string | null;
    canSendCommands: boolean;
    controls: string[];
    summary: string;
    goalLabel: string;
    suggestedPrompts: string[];
    telemetry: Record<string, unknown>;
  };
};

type FixtureServer = {
  baseUrl: string;
  state: FixtureState;
  close: () => Promise<void>;
};

type FixtureScenario = {
  appName: string;
  displayName: string;
  description: string;
  viewerPath: string;
  viewerTitle: string;
  launchType: "connect" | "url";
  capabilities: string[];
  sessionFeatures: string[];
  runId: string;
  viewerAuthMessage?: Record<string, unknown> | null;
  viewerReadyEventType?: string | null;
  viewerQuery?: Record<string, string>;
  sessionState: FixtureState["sessionState"];
  buildInitialState?: () => Partial<FixtureState>;
  extraRoutes?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    state: FixtureState,
  ) => Promise<boolean>;
};

async function proxyUiApiRequestsToFixture(
  page: Page,
  fixtureBaseUrl: string,
): Promise<void> {
  const fixtureOrigin = new URL(fixtureBaseUrl).origin;
  await page.context().route("**/api/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === fixtureOrigin) {
      await route.fallback();
      return;
    }

    const proxiedUrl = `${fixtureOrigin}${requestUrl.pathname}${requestUrl.search}`;
    const headers = { ...(await request.allHeaders()) };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];

    const response = await fetch(proxiedUrl, {
      method: request.method(),
      headers,
      body: request.postDataBuffer() ?? undefined,
      redirect: "manual",
    });

    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function installStableWebSocketMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class StableMockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      readonly url: string;
      readonly protocol = "";
      readonly extensions = "";
      binaryType: BinaryType = "blob";
      bufferedAmount = 0;
      readyState = StableMockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        window.setTimeout(() => {
          if (this.readyState === StableMockWebSocket.CLOSED) return;
          this.readyState = StableMockWebSocket.OPEN;
          const event = new Event("open");
          this.onopen?.(event);
          this.dispatchEvent(event);
          const readyEvent = new MessageEvent("message", {
            data: JSON.stringify({ type: "ready" }),
          });
          this.onmessage?.(readyEvent);
          this.dispatchEvent(readyEvent);
        }, 0);
      }

      send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {}

      close(): void {
        this.readyState = StableMockWebSocket.CLOSED;
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: StableMockWebSocket,
    });
  });
}

function buildViewerUrl(
  req: http.IncomingMessage,
  scenario: FixtureScenario,
): string {
  const url = new URL(scenario.viewerPath, `http://${req.headers.host}`);
  for (const [key, value] of Object.entries(scenario.viewerQuery ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildViewerHtml(scenario: FixtureScenario): string {
  const authMatchType =
    typeof scenario.viewerAuthMessage?.type === "string"
      ? scenario.viewerAuthMessage.type
      : null;
  const readyEventType = scenario.viewerReadyEventType ?? null;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${scenario.viewerTitle}</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #06070a;
        color: #f4f0e6;
        display: grid;
        min-height: 100vh;
        place-items: center;
      }
      main {
        width: min(32rem, 100%);
        border: 1px solid rgba(255, 205, 96, 0.28);
        border-radius: 20px;
        background: rgba(18, 18, 24, 0.92);
        padding: 24px;
        box-sizing: border-box;
      }
      .label {
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #ffcd60;
      }
      #viewer-state {
        margin-top: 12px;
        font-size: 20px;
        font-weight: 700;
      }
      pre {
        margin: 16px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 12px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="label">${scenario.viewerTitle}</div>
      <div id="viewer-state">booting</div>
      <pre id="auth-payload">waiting for auth</pre>
    </main>
    <script>
      const stateEl = document.getElementById("viewer-state");
      const payloadEl = document.getElementById("auth-payload");

      window.addEventListener("message", (event) => {
        payloadEl.textContent = JSON.stringify(
          { origin: event.origin, data: event.data },
          null,
          2,
        );
        stateEl.textContent = event.data?.type === ${JSON.stringify(authMatchType)}
          ? "auth-received"
          : "message-received";
      });

      window.addEventListener("load", () => {
        const parentOrigin = (() => {
          try {
            return new URL(document.referrer).origin;
          } catch {
            return "*";
          }
        })();

        ${
          readyEventType
            ? `window.setTimeout(() => {
          window.parent.postMessage(
            { type: ${JSON.stringify(readyEventType)} },
            parentOrigin,
          );
          stateEl.textContent = "ready-sent";
        }, 40);`
            : `stateEl.textContent = "ready";`
        }
      });
    </script>
  </body>
</html>`;
}

async function readJsonBody(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return null;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function applyCorsHeaders(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sendHtml(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  html: string,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function sendEmpty(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
): void {
  applyCorsHeaders(req, res);
  res.statusCode = status;
  res.end();
}

async function handleCommonFixtureRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/onboarding/status") {
    sendJson(req, res, 200, { complete: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    sendJson(req, res, 200, {
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/agent/status") {
    sendJson(req, res, 200, { onboardingComplete: true, status: "running" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(req, res, 200, {
      state: "running",
      agentName: "Chen",
      startup: { phase: "running", attempt: 0 },
      pendingRestart: false,
      pendingRestartReasons: [],
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/vincent/status") {
    sendJson(req, res, 200, {
      connected: false,
      connectedAt: null,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(req, res, 200, {
      cloud: { enabled: false },
      media: {},
      plugins: { entries: {} },
      ui: {},
      wallet: {},
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/conversations") {
    sendJson(req, res, 200, { conversations: [] });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workbench/overview") {
    sendJson(req, res, 200, {
      tasks: [],
      triggers: [],
      todos: [],
      summary: {
        totalTasks: 0,
        completedTasks: 0,
        totalTriggers: 0,
        activeTriggers: 0,
        totalTodos: 0,
        completedTodos: 0,
      },
      tasksAvailable: false,
      triggersAvailable: false,
      todosAvailable: false,
      lifeopsAvailable: false,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/plugins") {
    sendJson(req, res, 200, { plugins: [] });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/character") {
    sendJson(req, res, 200, {
      character: {},
      agentName: "Chen",
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/wallet/addresses") {
    sendJson(req, res, 200, {
      evmAddress: null,
      solanaAddress: null,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/stream/settings") {
    sendJson(req, res, 200, {
      ok: true,
      settings: {
        theme: "milady",
        avatarIndex: 0,
      },
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/stream/settings") {
    const body = await readJsonBody(req);
    const settings =
      body &&
      typeof body === "object" &&
      body.settings &&
      typeof body.settings === "object"
        ? body.settings
        : {};
    sendJson(req, res, 200, {
      ok: true,
      settings: {
        theme: "milady",
        avatarIndex: 0,
        ...settings,
      },
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/cloud/status") {
    sendJson(req, res, 200, {
      connected: false,
      enabled: false,
      cloudVoiceProxyAvailable: false,
      hasApiKey: false,
      reason: "runtime_not_started",
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/agent/events") {
    sendJson(req, res, 200, {
      events: [],
      latestEventId: null,
      totalBuffered: 0,
      replayed: true,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/drop/status") {
    sendJson(req, res, 200, {
      dropEnabled: false,
      publicMintOpen: false,
      whitelistMintOpen: false,
      mintedOut: false,
      currentSupply: 0,
      maxSupply: 2138,
      shinyPrice: "0.1",
      userHasMinted: false,
    });
    return true;
  }

  if (req.method === "HEAD" && url.pathname === "/api/avatar/vrm") {
    sendEmpty(req, res, 404);
    return true;
  }

  if (req.method === "HEAD" && url.pathname === "/api/avatar/background") {
    sendEmpty(req, res, 404);
    return true;
  }

  if (
    req.method === "GET" &&
    url.pathname === "/api/coding-agents/coordinator/status"
  ) {
    sendJson(req, res, 200, {
      supervisionLevel: "autonomous",
      taskCount: 0,
      tasks: [],
      pendingConfirmations: 0,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/coding-agents") {
    sendJson(req, res, 200, []);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/logs") {
    sendJson(req, res, 200, {
      entries: [],
      sources: [],
      tags: [],
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/music-player/status") {
    sendJson(req, res, 200, {
      guildId: null,
      track: null,
      streamUrl: null,
      isPaused: false,
    });
    return true;
  }

  return false;
}

async function startSessionFixture(
  scenario: FixtureScenario,
): Promise<FixtureServer> {
  const routeSlug = packageNameToAppRouteSlug(scenario.appName);
  if (!routeSlug) {
    throw new Error(`Missing route slug for ${scenario.appName}`);
  }

  const state: FixtureState = {
    launchRequestName: null,
    lastCommand: null,
    lastControlAction: null,
    runPollCount: 0,
    sessionPollCount: 0,
    unexpectedRequests: [],
    sessionState: scenario.sessionState,
    ...(scenario.buildInitialState?.() ?? {}),
  };

  const buildRunSummary = (req: http.IncomingMessage) => {
    const viewer = scenario.viewerPath
      ? {
          url: buildViewerUrl(req, scenario),
          postMessageAuth: Boolean(scenario.viewerAuthMessage),
          sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
          authMessage: scenario.viewerAuthMessage ?? undefined,
        }
      : null;

    return {
      runId: scenario.runId,
      appName: scenario.appName,
      displayName: scenario.displayName,
      pluginName: scenario.appName,
      launchType: scenario.launchType,
      launchUrl: null,
      viewer,
      session: state.sessionState,
      status: state.sessionState.status,
      summary: state.sessionState.summary,
      startedAt: "2026-04-06T07:00:00.000Z",
      updatedAt: "2026-04-06T07:00:00.000Z",
      lastHeartbeatAt: "2026-04-06T07:00:00.000Z",
      supportsBackground: true,
      viewerAttachment: viewer ? "attached" : "unavailable",
      health: {
        state: "healthy",
        message: null,
      },
    };
  };

  const sockets = new Set<Socket>();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") {
      applyCorsHeaders(req, res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (
      scenario.viewerPath &&
      req.method === "GET" &&
      url.pathname === scenario.viewerPath
    ) {
      sendHtml(req, res, 200, buildViewerHtml(scenario));
      return;
    }

    if (await handleCommonFixtureRequest(req, res, url)) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/apps") {
      sendJson(req, res, 200, [
        {
          name: scenario.appName,
          displayName: scenario.displayName,
          description: scenario.description,
          category: "game",
          launchType: scenario.launchType,
          launchUrl: null,
          icon: null,
          capabilities: scenario.capabilities,
          stars: 42,
          repository: `https://github.com/elizaos/${routeSlug}`,
          latestVersion: "0.1.0",
          supports: { v0: false, v1: false, v2: true },
          npm: {
            package: scenario.appName,
            v0Version: null,
            v1Version: null,
            v2Version: "0.1.0",
          },
          viewer: scenario.viewerPath
            ? {
                url: buildViewerUrl(req, scenario),
                postMessageAuth: Boolean(scenario.viewerAuthMessage),
                sandbox:
                  "allow-scripts allow-same-origin allow-popups allow-forms",
              }
            : null,
          session: {
            mode: "spectate-and-steer",
            features: scenario.sessionFeatures,
          },
        },
      ]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/apps/installed") {
      sendJson(req, res, 200, [
        {
          name: scenario.appName,
          displayName: scenario.displayName,
          version: "0.1.0",
          installPath: `/plugins/${routeSlug}`,
          installedAt: "2026-04-04T08:00:00.000Z",
          isRunning: true,
        },
      ]);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === `/api/apps/info/${encodeURIComponent(scenario.appName)}`
    ) {
      sendJson(req, res, 200, {
        name: scenario.appName,
        displayName: scenario.displayName,
        description: scenario.description,
        category: "game",
        launchType: scenario.launchType,
        launchUrl: null,
        icon: null,
        capabilities: scenario.capabilities,
        viewer: scenario.viewerPath
          ? {
              url: buildViewerUrl(req, scenario),
              postMessageAuth: Boolean(scenario.viewerAuthMessage),
              sandbox:
                "allow-scripts allow-same-origin allow-popups allow-forms",
            }
          : null,
        session: {
          mode: "spectate-and-steer",
          features: scenario.sessionFeatures,
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/apps/runs") {
      sendJson(
        req,
        res,
        200,
        state.launchRequestName ? [buildRunSummary(req)] : [],
      );
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === `/api/apps/runs/${encodeURIComponent(scenario.runId)}`
    ) {
      if (!state.launchRequestName) {
        sendJson(req, res, 404, { error: "Run not found" });
        return;
      }
      state.runPollCount += 1;
      sendJson(req, res, 200, buildRunSummary(req));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/apps/launch") {
      const body = await readJsonBody(req);
      state.launchRequestName =
        typeof body?.name === "string" ? body.name : null;
      const run = buildRunSummary(req);

      sendJson(req, res, 200, {
        pluginInstalled: true,
        needsRestart: false,
        displayName: scenario.displayName,
        launchType: scenario.launchType,
        launchUrl: null,
        viewer: run.viewer,
        session: state.sessionState,
        run,
      });
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname ===
        `/api/apps/runs/${encodeURIComponent(scenario.runId)}/message`
    ) {
      const body = await readJsonBody(req);
      const content =
        typeof body?.content === "string" ? body.content.trim() : "";
      state.lastCommand = content;
      state.sessionState = {
        ...state.sessionState,
        summary: `Command: ${content}`,
      };
      const run = buildRunSummary(req);
      sendJson(req, res, 200, {
        success: true,
        message: `Command relayed to ${scenario.displayName}`,
        disposition:
          scenario.appName === "@elizaos/app-2004scape" ? "queued" : "accepted",
        status: 200,
        run,
        session: state.sessionState,
      });
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname ===
        `/api/apps/runs/${encodeURIComponent(scenario.runId)}/control`
    ) {
      const body = await readJsonBody(req);
      const action = typeof body?.action === "string" ? body.action.trim() : "";
      state.lastControlAction = action;
      const paused = action === "pause";
      state.sessionState = {
        ...state.sessionState,
        status: paused ? "paused" : "running",
        controls: paused ? ["resume"] : ["pause"],
        summary: paused
          ? "Session paused from Milady"
          : "Session resumed from Milady",
      };
      const run = buildRunSummary(req);
      sendJson(req, res, 200, {
        success: true,
        message: paused
          ? `Paused ${scenario.displayName}`
          : `Resumed ${scenario.displayName}`,
        disposition: "accepted",
        status: 200,
        run,
        session: state.sessionState,
      });
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname.startsWith(`/api/apps/${routeSlug}/session/`)
    ) {
      state.sessionPollCount += 1;
      sendJson(req, res, 200, state.sessionState);
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname.startsWith(`/api/apps/${routeSlug}/session/`) &&
      url.pathname.endsWith("/message")
    ) {
      const body = await readJsonBody(req);
      const content =
        typeof body?.content === "string" ? body.content.trim() : "";
      state.lastCommand = content;
      state.sessionState = {
        ...state.sessionState,
        summary: `Command: ${content}`,
      };

      sendJson(req, res, 200, {
        success: true,
        message: `Command relayed to ${scenario.displayName}`,
        session: state.sessionState,
      });
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname.startsWith(`/api/apps/${routeSlug}/session/`) &&
      url.pathname.endsWith("/control")
    ) {
      const body = await readJsonBody(req);
      const action = typeof body?.action === "string" ? body.action.trim() : "";
      state.lastControlAction = action;
      const paused = action === "pause";
      state.sessionState = {
        ...state.sessionState,
        status: paused ? "paused" : "running",
        controls: paused ? ["resume"] : ["pause"],
        summary: paused
          ? "Session paused from Milady"
          : "Session resumed from Milady",
      };

      sendJson(req, res, 200, {
        success: true,
        message: paused
          ? `Paused ${scenario.displayName}`
          : `Resumed ${scenario.displayName}`,
        session: state.sessionState,
      });
      return;
    }

    if (
      scenario.extraRoutes &&
      (await scenario.extraRoutes(req, res, url, state))
    ) {
      return;
    }

    state.unexpectedRequests.push(`${req.method ?? "GET"} ${url.pathname}`);
    sendJson(req, res, 404, {
      error: `Unhandled ${req.method} ${url.pathname}`,
    });
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

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const upgradeUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (upgradeUrl.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit("connection", ws, req);
    });
  });

  wsServer.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "ready" }));
    ws.on("message", () => {});
  });

  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("Fixture server did not expose an address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state,
    close: async () => {
      for (const client of wsServer.clients) {
        client.terminate();
      }
      wsServer.close();
      for (const socket of sockets) {
        socket.destroy();
      }
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
  };
}

async function startAppsSessionFixture(): Promise<FixtureServer> {
  return startSessionFixture({
    appName: "@hyperscape/plugin-hyperscape",
    displayName: "Hyperscape",
    description:
      "Spectate your agent live in a multiplayer world and steer it with real-time commands.",
    viewerPath: VIEWER_PATH,
    viewerTitle: "Hyperscape Viewer Fixture",
    launchType: "connect",
    capabilities: ["combat", "skills", "inventory", "social-chat"],
    sessionFeatures: [
      "commands",
      "telemetry",
      "pause",
      "resume",
      "suggestions",
    ],
    runId: "run-hyperscape-1",
    viewerReadyEventType: "HYPERSCAPE_READY",
    viewerQuery: {
      embedded: "true",
      mode: "spectator",
      surface: "agent-control",
    },
    viewerAuthMessage: {
      type: "HYPERSCAPE_AUTH",
      authToken: "test-auth-token",
      agentId: "agent-scout-1",
      characterId: "char-scout-1",
      followEntity: "entity-scout-1",
    },
    sessionState: {
      sessionId: SESSION_ID,
      appName: "@hyperscape/plugin-hyperscape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Hyperscape",
      agentId: "agent-scout-1",
      characterId: "char-scout-1",
      followEntity: "entity-scout-1",
      canSendCommands: true,
      controls: ["pause"],
      summary: "Following Scout live in Hyperscape",
      goalLabel: "Scout is roaming toward the moon gate",
      suggestedPrompts: [
        "Check the moon gate",
        "Talk to the trader",
        "Pick up the dropped relic",
      ],
      telemetry: {
        zone: "Liminal Bazaar",
        mode: "spectating",
      },
    },
  });
}

async function startBabylonSessionFixture(): Promise<FixtureServer> {
  return startSessionFixture({
    appName: "@elizaos/app-babylon",
    displayName: "Babylon",
    description:
      "Coordinate autonomous market play, team chat, and operator steering from one live dashboard.",
    viewerPath: "/viewer/babylon",
    viewerTitle: "Babylon Viewer Fixture",
    launchType: "connect",
    capabilities: ["team-chat", "markets", "predictions", "steering"],
    sessionFeatures: ["commands", "telemetry", "suggestions"],
    runId: "run-babylon-1",
    viewerReadyEventType: "BABYLON_READY",
    viewerQuery: {
      embedded: "true",
    },
    viewerAuthMessage: {
      type: "BABYLON_AUTH",
      authToken: "babylon-session-token",
      agentId: "agent-babylon-1",
      characterId: "character-babylon-1",
    },
    buildInitialState: () => ({
      chatMessages: [
        {
          id: "msg-1",
          senderId: "operator",
          senderName: "Operator",
          content: "Protect liquidity first.",
          createdAt: "2026-04-06T00:00:09.000Z",
        },
      ],
    }),
    sessionState: {
      sessionId: "babylon-session",
      appName: "@elizaos/app-babylon",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Babylon",
      agentId: "agent-babylon-1",
      characterId: "character-babylon-1",
      followEntity: null,
      canSendCommands: true,
      controls: [],
      summary: "Babylon is coordinating the team before the next buy.",
      goalLabel: "Protect liquidity while the market refreshes",
      suggestedPrompts: ["protect liquidity", "avoid thin markets"],
      telemetry: {
        team: "Babylon Team",
        market: "prediction",
      },
    },
    extraRoutes: async (req, res, url, state) => {
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/status"
      ) {
        sendJson(req, res, 200, {
          id: "agent-babylon-1",
          name: "babylon-alpha",
          displayName: "Babylon Alpha",
          balance: 120.5,
          lifetimePnL: 42,
          winRate: 0.72,
          reputationScore: 91,
          totalTrades: 8,
          autonomous: true,
          autonomousTrading: true,
          autonomousPosting: true,
          autonomousCommenting: false,
          autonomousDMs: true,
          agentStatus: "active",
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/summary"
      ) {
        sendJson(req, res, 200, {
          agent: {
            id: "agent-babylon-1",
            name: "babylon-alpha",
            totalDeposited: 250,
            totalWithdrawn: 25,
          },
          portfolio: {
            totalPnL: 42,
            positions: 4,
            totalAssets: 500,
            available: 150,
            wallet: 350,
            agents: 2,
            totalPoints: 11,
          },
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/goals"
      ) {
        sendJson(req, res, 200, [
          {
            id: "goal-1",
            description: "Protect the market",
            status: "active",
            progress: 0.6,
            createdAt: "2026-04-06T00:00:00.000Z",
          },
        ]);
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/recent-trades"
      ) {
        sendJson(req, res, 200, {
          items: [
            {
              id: "trade-1",
              type: "trade",
              timestamp: "2026-04-06T00:00:10.000Z",
              ticker: "BAB",
              action: "buy",
              amount: 50,
              pnl: 4.25,
              summary: "Bought protection after volatility rose.",
            },
          ],
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/markets/predictions"
      ) {
        sendJson(req, res, 200, {
          markets: [
            {
              id: "market-1",
              title: "Will Babylon close green?",
              status: "open",
              yesPrice: 0.61,
              noPrice: 0.39,
              volume: 1200,
              liquidity: 800,
              createdAt: "2026-04-06T00:00:00.000Z",
            },
          ],
          total: 1,
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/team/dashboard"
      ) {
        sendJson(req, res, 200, {
          agents: [
            {
              id: "team-1",
              name: "sentinel",
              balance: 100,
              lifetimePnL: 12,
              winRate: 0.5,
              reputationScore: 11,
              totalTrades: 2,
              autonomous: true,
            },
          ],
          summary: {
            ownerName: "Babylon Team",
            totals: {
              walletBalance: 350,
              lifetimePnL: 42,
              unrealizedPnL: 3,
              currentPnL: 9,
              openPositions: 4,
            },
          },
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/team/conversations"
      ) {
        sendJson(req, res, 200, {
          conversations: [
            {
              id: "conv-1",
              name: "Market protection",
              createdAt: "2026-04-06T00:00:00.000Z",
              updatedAt: "2026-04-06T00:00:10.000Z",
              isActive: true,
            },
          ],
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/chat"
      ) {
        sendJson(req, res, 200, {
          messages: state.chatMessages ?? [],
        });
        return true;
      }
      if (
        req.method === "POST" &&
        url.pathname === "/api/apps/babylon/agent/chat"
      ) {
        const body = await readJsonBody(req);
        const content =
          typeof body?.content === "string" ? body.content.trim() : "";
        state.lastCommand = content;
        state.chatMessages = [
          ...(state.chatMessages ?? []),
          {
            id: `msg-${(state.chatMessages?.length ?? 0) + 1}`,
            senderId: "operator",
            senderName: "Operator",
            content,
            createdAt: "2026-04-06T00:00:12.000Z",
          },
        ];
        sendJson(req, res, 200, {
          success: true,
          message: "Suggestion sent to Babylon.",
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/wallet"
      ) {
        sendJson(req, res, 200, {
          balance: 350,
          transactions: [],
        });
        return true;
      }
      if (
        req.method === "GET" &&
        url.pathname === "/api/apps/babylon/agent/trading-balance"
      ) {
        sendJson(req, res, 200, {
          balance: 150,
        });
        return true;
      }
      if (
        req.method === "POST" &&
        url.pathname === "/api/apps/babylon/agent/toggle"
      ) {
        const body = await readJsonBody(req);
        state.lastControlAction =
          typeof body?.action === "string" ? body.action : null;
        sendJson(req, res, 200, {
          success: true,
          message: "Autonomy updated",
        });
        return true;
      }
      return false;
    },
  });
}

async function startTwoThousandFourScapeSessionFixture(): Promise<FixtureServer> {
  return startSessionFixture({
    appName: "@elizaos/app-2004scape",
    displayName: "2004scape",
    description:
      "Launch a persistent autonomous bot and steer it without breaking the live loop.",
    viewerPath: "/viewer/2004scape",
    viewerTitle: "2004scape Viewer Fixture",
    launchType: "connect",
    capabilities: ["auto-login", "bot-loop", "telemetry", "steering"],
    sessionFeatures: [
      "commands",
      "telemetry",
      "pause",
      "resume",
      "suggestions",
    ],
    runId: "run-2004scape-1",
    viewerReadyEventType: "RS_2004SCAPE_READY",
    viewerAuthMessage: {
      type: "RS_2004SCAPE_AUTH",
      authToken: "bot-user",
      sessionToken: "bot-pass",
      characterId: "character-2004-1",
      agentId: "agent-2004-1",
    },
    sessionState: {
      sessionId: "2004scape-session",
      appName: "@elizaos/app-2004scape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "2004scape",
      agentId: "agent-2004-1",
      characterId: "character-2004-1",
      followEntity: "character-2004-1",
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: "Tutorial island: Do you want to skip the tutorial?",
      goalLabel: "Finish tutorial and reach the mainland.",
      suggestedPrompts: [
        "Finish tutorial",
        "Chop nearby tree",
        "Catch nearby fish",
        "Walk around",
      ],
      telemetry: {
        botName: "bot-user",
        autoPlay: true,
        intent: "tutorial",
        tutorial: {
          active: true,
          guideNearby: true,
          prompt: "Do you want to skip the tutorial?",
        },
        player: {
          name: "Bot User",
          worldX: 3222,
          worldZ: 3221,
          hp: 10,
          maxHp: 10,
        },
        combatStyle: {
          weaponName: "Bronze dagger",
          activeStyle: "Accurate",
        },
        nearbyNpcs: [
          {
            name: "RuneScape Guide",
            distance: 1.2,
            optionsWithIndex: [{ text: "Talk-to" }],
          },
        ],
        nearbyLocs: [
          {
            name: "Tree",
            distance: 2.4,
            optionsWithIndex: [{ text: "Chop down" }],
          },
        ],
        gameMessages: [
          {
            sender: "Game",
            text: "Welcome to RuneScape.",
          },
        ],
        recentActivity: [
          {
            action: "tutorial",
            detail: "Accepted the starter appearance preset.",
            ts: "2026-04-06T00:00:10.000Z",
          },
        ],
      },
    },
  });
}

async function startDefenseSessionFixture(): Promise<FixtureServer> {
  return startSessionFixture({
    appName: "@elizaos/app-defense-of-the-agents",
    displayName: "Defense of the Agents",
    description:
      "Watch the local spectator shell and steer the autoplaying hero with live strategy guidance.",
    viewerPath: "/viewer/defense",
    viewerTitle: "Defense Viewer Fixture",
    launchType: "connect",
    capabilities: ["autoplay", "strategy", "spectator-shell", "steering"],
    sessionFeatures: ["commands", "telemetry", "suggestions"],
    runId: "run-defense-1",
    sessionState: {
      sessionId: "defense-session",
      appName: "@elizaos/app-defense-of-the-agents",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Defense of the Agents",
      agentId: "agent-defense-1",
      characterId: "character-defense-1",
      followEntity: null,
      canSendCommands: true,
      controls: [],
      summary: "Holding mid lane while autoplay farms safely.",
      goalLabel: "Protect mid lane without losing tower health.",
      suggestedPrompts: ["tell the hero to rotate bot"],
      telemetry: {
        heroClass: "Ranger",
        heroLane: "mid",
        heroLevel: 12,
        heroHp: 73,
        heroMaxHp: 100,
        autoPlay: true,
        strategyVersion: 3,
        recentActivity: [
          {
            ts: 1_712_345_678_000,
            action: "rotate",
            detail: "Moved from top lane to defend mid.",
          },
        ],
      },
    },
  });
}

test("apps page launches a Hyperscape session with iframe auth and live session state", async ({
  page,
}) => {
  const fixture = await startAppsSessionFixture();

  await page.addInitScript((apiBase) => {
    window.__MILADY_API_BASE__ = apiBase;
    window.localStorage.setItem("milady_api_base", apiBase);
    window.sessionStorage.setItem("milady_api_base", apiBase);
  }, fixture.baseUrl);
  await installStableWebSocketMock(page);
  await proxyUiApiRequestsToFixture(page, fixture.baseUrl);
  await installDefaultAppMocks(page, { includeConfig: true });
  await seedAppStorage(page, {
    milady_api_base: fixture.baseUrl,
    "milady:active-server": JSON.stringify({
      id: "remote:fixture",
      kind: "remote",
      label: "Fixture API",
      apiBase: fixture.baseUrl,
    }),
  });

  try {
    await openAppPath(
      page,
      `/apps?apiBase=${encodeURIComponent(fixture.baseUrl)}`,
    );

    await expect(page.getByTestId("apps-session-status-card")).toContainText(
      "No app session running",
    );
    await expect(
      page.getByTestId("app-card--hyperscape-plugin-hyperscape"),
    ).toBeVisible();
    await expect(page.getByTestId("apps-detail-panel")).toContainText(
      "Spectate + steer",
    );

    await page.getByTestId("apps-detail-launch").click();

    await expect
      .poll(() => fixture.state.launchRequestName, {
        message: "launch should target the Hyperscape app package",
      })
      .toBe("@hyperscape/plugin-hyperscape");

    await expect
      .poll(async () =>
        page.getByTestId("game-view-iframe").getAttribute("src"),
      )
      .toContain("surface=agent-control");

    const frame = page.frameLocator('[data-testid="game-view-iframe"]');
    await expect(frame.locator("#viewer-state")).toHaveText("auth-received");
    await expect(frame.locator("#auth-payload")).toContainText(
      '"type": "HYPERSCAPE_AUTH"',
    );
    await expect(frame.locator("#auth-payload")).toContainText(
      '"followEntity": "entity-scout-1"',
    );

    await expect
      .poll(() => fixture.state.runPollCount, {
        message: "run state should be refreshed after launch",
      })
      .toBeGreaterThan(0);

    const sessionStatus = page.getByTestId("game-session-status");
    await expect(sessionStatus).toContainText(
      /Following Scout live in Hyperscape|Session unavailable: Hyperscape/,
    );

    const benignRequests = new Set([
      "POST /api/lifeops/activity-signals",
      "GET /api/lifeops/connectors/google/status",
    ]);
    expect(
      fixture.state.unexpectedRequests.filter(
        (request) => !benignRequests.has(request),
      ),
    ).toEqual([]);
  } finally {
    if (!page.isClosed()) {
      await page.goto("about:blank");
    }
    await fixture.close();
  }
});

test("apps page launches a Babylon session with embedded auth and the live dashboard", async ({
  page,
}) => {
  const fixture = await startBabylonSessionFixture();

  await page.addInitScript((apiBase) => {
    window.__MILADY_API_BASE__ = apiBase;
    window.localStorage.setItem("milady_api_base", apiBase);
    window.sessionStorage.setItem("milady_api_base", apiBase);
  }, fixture.baseUrl);
  await installStableWebSocketMock(page);
  await proxyUiApiRequestsToFixture(page, fixture.baseUrl);
  await installDefaultAppMocks(page, { includeConfig: true });
  await seedAppStorage(page, {
    milady_api_base: fixture.baseUrl,
    "milady:active-server": JSON.stringify({
      id: "remote:fixture",
      kind: "remote",
      label: "Fixture API",
      apiBase: fixture.baseUrl,
    }),
  });

  try {
    await openAppPath(
      page,
      `/apps?apiBase=${encodeURIComponent(fixture.baseUrl)}`,
    );

    await expect(
      page.getByTestId("app-card--elizaos-app-babylon"),
    ).toBeVisible();
    await page.getByTestId("apps-detail-launch").click();

    await expect
      .poll(() => fixture.state.launchRequestName, {
        message: "launch should target the Babylon app package",
      })
      .toBe("@elizaos/app-babylon");

    await expect
      .poll(async () =>
        page.getByTestId("game-view-iframe").getAttribute("src"),
      )
      .toContain("embedded=true");

    const frame = page.frameLocator('[data-testid="game-view-iframe"]');
    await expect(frame.locator("#viewer-state")).toHaveText("auth-received");
    await expect(frame.locator("#auth-payload")).toContainText(
      '"type": "BABYLON_AUTH"',
    );

    const surface = page.getByTestId("babylon-live-operator-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByText("Babylon Live Dashboard")).toBeVisible();
    const chatInput = surface.getByPlaceholder(
      "Tell Babylon what to prioritize, avoid, or explain.",
    );
    await expect(chatInput).toBeVisible();
    await chatInput.fill("protect liquidity");
    await surface.getByRole("button", { name: "Send" }).click();

    await expect
      .poll(() => fixture.state.lastCommand, {
        message: "Babylon chat should reach the live dashboard route",
      })
      .toBe("protect liquidity");
  } finally {
    if (!page.isClosed()) {
      await page.goto("about:blank");
    }
    await fixture.close();
  }
});

test("apps page launches a 2004scape session with auto-login and mobile dashboard switching", async ({
  page,
}) => {
  const fixture = await startTwoThousandFourScapeSessionFixture();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.addInitScript((apiBase) => {
    window.__MILADY_API_BASE__ = apiBase;
    window.localStorage.setItem("milady_api_base", apiBase);
    window.sessionStorage.setItem("milady_api_base", apiBase);
  }, fixture.baseUrl);
  await installStableWebSocketMock(page);
  await proxyUiApiRequestsToFixture(page, fixture.baseUrl);
  await installDefaultAppMocks(page, { includeConfig: true });
  await seedAppStorage(page, {
    milady_api_base: fixture.baseUrl,
    "milady:active-server": JSON.stringify({
      id: "remote:fixture",
      kind: "remote",
      label: "Fixture API",
      apiBase: fixture.baseUrl,
    }),
  });

  try {
    await openAppPath(
      page,
      `/apps?apiBase=${encodeURIComponent(fixture.baseUrl)}`,
    );

    const appCard = page.getByTestId("app-card--elizaos-app-2004scape");
    await expect(appCard).toBeVisible();
    await appCard.click();
    const detailPanel = page.getByTestId("apps-detail-panel");
    await expect(detailPanel).toBeVisible();
    await detailPanel.getByRole("button", { name: /^Launch$/ }).click();

    await expect
      .poll(() => fixture.state.launchRequestName, {
        message: "launch should target the 2004scape app package",
      })
      .toBe("@elizaos/app-2004scape");

    const frame = page.frameLocator('[data-testid="game-view-iframe"]');
    await expect(frame.locator("#viewer-state")).toHaveText("auth-received");
    await expect(frame.locator("#auth-payload")).toContainText(
      '"type": "RS_2004SCAPE_AUTH"',
    );

    await expect(
      page.getByTestId("game-mobile-surface-dashboard"),
    ).toBeVisible();
    await page.getByTestId("game-mobile-surface-dashboard").click();
    const surface = page.getByTestId("2004scape-live-operator-surface");
    await expect(surface).toBeVisible();
    await expect(surface.getByText("2004scape Live Dashboard")).toBeVisible();
    await expect(surface).toContainText("Credentials stored");
    await expect(surface).toContainText(
      "Bot bot-user is ready for automatic sign-in.",
    );
    await expect(surface).toContainText("Tutorial in progress");
    await expect(surface).toContainText("RuneScape Guide");
    await expect(surface).not.toContainText("RS_2004SCAPE_AUTH");
    await expect(surface).not.toContainText("bot-pass");

    const initialRunPollCount = fixture.state.runPollCount;
    await page.waitForTimeout(6_500);
    expect(
      fixture.state.runPollCount - initialRunPollCount,
    ).toBeLessThanOrEqual(3);
    expect(fixture.state.sessionPollCount).toBeLessThanOrEqual(1);

    await page.getByTestId("game-mobile-surface-chat").click();
    const chatSurface = page.getByTestId("2004scape-live-operator-surface");
    const promptButton = chatSurface.getByRole("button", {
      name: "Chop nearby tree",
    });
    await expect(promptButton).toBeVisible();
    await promptButton.click();

    await expect
      .poll(() => fixture.state.lastCommand, {
        message: "2004scape guidance should reach the session bridge",
      })
      .toBe("Chop nearby tree");

    const operatorInput = chatSurface.getByPlaceholder(
      "Tell the bot what to train, where to go, or what to say.",
    );
    await operatorInput.fill("say hello from mobile");
    await chatSurface.getByRole("button", { name: "Send" }).click();

    await expect
      .poll(() => fixture.state.lastCommand, {
        message: "manual 2004scape chat should reach the session bridge",
      })
      .toBe("say hello from mobile");

    const pauseButton = chatSurface.getByRole("button", {
      name: "Pause session",
    });
    await expect(pauseButton).toBeVisible();
    await pauseButton.click();

    await expect
      .poll(() => fixture.state.lastControlAction, {
        message: "pause control should reach the 2004scape session bridge",
      })
      .toBe("pause");

    const resumeButton = chatSurface.getByRole("button", {
      name: "Resume session",
    });
    await expect(resumeButton).toBeVisible();
    await resumeButton.click();

    await expect
      .poll(() => fixture.state.lastControlAction, {
        message: "resume control should reach the 2004scape session bridge",
      })
      .toBe("resume");
  } finally {
    if (!page.isClosed()) {
      await page.goto("about:blank");
    }
    await fixture.close();
  }
});

test("apps page launches a Defense session with the spectator shell and live steering prompts", async ({
  page,
}) => {
  const fixture = await startDefenseSessionFixture();

  await page.addInitScript((apiBase) => {
    window.__MILADY_API_BASE__ = apiBase;
    window.localStorage.setItem("milady_api_base", apiBase);
    window.sessionStorage.setItem("milady_api_base", apiBase);
  }, fixture.baseUrl);
  await installStableWebSocketMock(page);
  await proxyUiApiRequestsToFixture(page, fixture.baseUrl);
  await installDefaultAppMocks(page, { includeConfig: true });
  await seedAppStorage(page, {
    milady_api_base: fixture.baseUrl,
    "milady:active-server": JSON.stringify({
      id: "remote:fixture",
      kind: "remote",
      label: "Fixture API",
      apiBase: fixture.baseUrl,
    }),
  });

  try {
    await openAppPath(
      page,
      `/apps?apiBase=${encodeURIComponent(fixture.baseUrl)}`,
    );

    await expect(
      page.getByTestId("app-card--elizaos-app-defense-of-the-agents"),
    ).toBeVisible();
    await page.getByTestId("apps-detail-launch").click();

    await expect
      .poll(() => fixture.state.launchRequestName, {
        message: "launch should target the Defense app package",
      })
      .toBe("@elizaos/app-defense-of-the-agents");

    const frame = page.frameLocator('[data-testid="game-view-iframe"]');
    await expect(frame.locator("body")).toContainText("Defense Viewer Fixture");

    await expect(page.getByText("Defense Live Dashboard")).toBeVisible();
    const promptButton = page.getByRole("button", {
      name: "tell the hero to rotate bot",
    });
    await expect(promptButton).toBeVisible();
    await promptButton.click();

    await expect
      .poll(() => fixture.state.lastCommand, {
        message: "Defense suggested prompts should relay to the live session",
      })
      .toBe("tell the hero to rotate bot");
  } finally {
    if (!page.isClosed()) {
      await page.goto("about:blank");
    }
    await fixture.close();
  }
});
