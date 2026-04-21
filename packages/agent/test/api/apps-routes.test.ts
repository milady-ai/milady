import type { IAgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  AppManagerLike,
  AppsRouteContext,
  PluginManagerLike,
} from "../../src/api/apps-routes";
import { handleAppsRoutes } from "../../src/api/apps-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const { mockImportAppRouteModule } = vi.hoisted(() => ({
  mockImportAppRouteModule: vi.fn(),
}));

vi.mock("../../src/services/app-package-modules.js", () => ({
  importAppRouteModule: mockImportAppRouteModule,
}));

function buildPluginManager(
  overrides: Partial<PluginManagerLike> = {},
): PluginManagerLike {
  return {
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async () => null),
    refreshRegistry: vi.fn(async () => new Map()),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      version: "1.0.0",
      installPath: "/tmp",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      ejectedPath: "/tmp",
      requiresRestart: false,
    })),
    syncPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      ejectedPath: "/tmp",
      requiresRestart: false,
    })),
    reinjectPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "test",
      removedPath: "/tmp",
      requiresRestart: false,
    })),
    ...overrides,
  };
}

function buildAppManager(
  overrides: Partial<AppManagerLike> = {},
): AppManagerLike {
  return {
    listAvailable: vi.fn(async () => []),
    search: vi.fn(async () => []),
    listInstalled: vi.fn(async () => []),
    listRuns: vi.fn(async (_runtime?: IAgentRuntime | null) => []),
    getRun: vi.fn(
      async (_runId: string, _runtime?: IAgentRuntime | null) => null,
    ),
    attachRun: vi.fn(
      async (_runId: string, _runtime?: IAgentRuntime | null) => ({
        success: true,
        message: "attached",
      }),
    ),
    detachRun: vi.fn(async () => ({ success: true, message: "detached" })),
    launch: vi.fn(async () => ({ success: true })),
    stop: vi.fn(async () => ({ success: true })),
    getInfo: vi.fn(async () => null),
    ...overrides,
  };
}

function buildCtx(overrides: Partial<AppsRouteContext> = {}): AppsRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method: "GET", url: "/" }),
    res,
    method: "GET",
    pathname: "/",
    url: new URL("http://localhost:2138/"),
    appManager: buildAppManager(),
    getPluginManager: () => buildPluginManager(),
    parseBoundedLimit: vi.fn((raw, fallback = 20) =>
      raw ? Math.min(Math.max(1, Number(raw)), 100) : fallback,
    ),
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 500) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
    runtime: null,
    ...overrides,
  };
}

describe("handleAppsRoutes", () => {
  beforeEach(() => {
    mockImportAppRouteModule.mockReset();
  });

  test("returns false for unrelated path", async () => {
    const ctx = buildCtx({ pathname: "/api/other" });
    const handled = await handleAppsRoutes(ctx);
    expect(handled).toBe(false);
  });

  test("GET /api/apps returns available apps list", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const apps = [{ name: "test-app", version: "1.0.0" }];
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps",
      res,
      appManager: buildAppManager({
        listAvailable: vi.fn(async () => apps),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(apps);
  });

  test("GET /api/apps/search returns empty array for blank query", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/search",
      url: new URL("http://localhost:2138/api/apps/search?q="),
      res,
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual([]);
  });

  test("GET /api/apps/runs returns persisted runs", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const runtime = { agentId: "runtime-agent-id" } as IAgentRuntime;
    const listRuns = vi.fn(async (_runtime?: IAgentRuntime | null) => [
      {
        runId: "run-1",
        appName: "@hyperscape/plugin-hyperscape",
        displayName: "Hyperscape",
      },
    ]);
    const runs = [
      {
        runId: "run-1",
        appName: "@hyperscape/plugin-hyperscape",
        displayName: "Hyperscape",
      },
    ];
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs",
      res,
      runtime,
      appManager: buildAppManager({
        listRuns,
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(listRuns).toHaveBeenCalledWith(runtime);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(runs);
  });

  test("GET /api/apps/runs/:runId returns 404 when missing", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs/run-404",
      res,
      appManager: buildAppManager({
        getRun: vi.fn(async () => null),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(404);
    expect(getJson()).toEqual({
      error: 'App run "run-404" not found',
    });
  });

  test("GET /api/apps/runs/:runId/health returns the run health payload", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "GET",
      pathname: "/api/apps/runs/run-1/health",
      res,
      appManager: buildAppManager({
        getRun: vi.fn(async () => ({
          runId: "run-1",
          health: {
            state: "healthy",
            message: null,
          },
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      state: "healthy",
      message: null,
    });
  });

  test("POST /api/apps/runs/:runId/message proxies to the app route module", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const run = {
      runId: "run-1",
      appName: "@hyperscape/plugin-hyperscape",
      displayName: "Hyperscape",
      session: {
        sessionId: "agent-1",
      },
      health: {
        state: "healthy",
        message: null,
      },
    };
    type RouteCtx = {
      pathname: string;
      readJsonBody: <T extends object>() => Promise<T | null>;
      json: (res: unknown, data: object, status?: number) => void;
      res: unknown;
    };
    const handleAppRoutes = vi.fn(async (routeCtx: RouteCtx) => {
      expect(routeCtx.pathname).toBe(
        "/api/apps/hyperscape/session/agent-1/message",
      );
      const body = await routeCtx.readJsonBody();
      expect(body).toEqual({
        content: "Go explore the mine.",
      });
      routeCtx.json(
        routeCtx.res,
        {
          success: true,
          message: "Queued guidance for Hyperscape.",
          session: {
            sessionId: "agent-1",
            appName: "@hyperscape/plugin-hyperscape",
            mode: "spectate-and-steer",
            status: "running",
          },
        },
        202,
      );
      return true;
    });
    mockImportAppRouteModule.mockResolvedValue({ handleAppRoutes });
    const getRun = vi.fn(async () => run);
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/message",
      res,
      readJsonBody: vi.fn(async () => ({ content: "Go explore the mine." })),
      appManager: buildAppManager({
        getRun,
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getRun).toHaveBeenCalledWith("run-1", null);
    expect(getStatus()).toBe(202);
    expect(getJson()).toEqual({
      success: true,
      message: "Queued guidance for Hyperscape.",
      disposition: "queued",
      status: 202,
      run: {
        runId: "run-1",
        appName: "@hyperscape/plugin-hyperscape",
        displayName: "Hyperscape",
        session: {
          sessionId: "agent-1",
        },
        health: {
          state: "healthy",
          message: null,
        },
      },
      session: {
        sessionId: "agent-1",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
      },
    });
  });

  test("POST /api/apps/runs/:runId/control returns unsupported when no steering handler exists", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    mockImportAppRouteModule.mockResolvedValue({ handleAppRoutes: undefined });
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/control",
      res,
      readJsonBody: vi.fn(async () => ({ action: "pause" })),
      appManager: buildAppManager({
        getRun: vi.fn(async () => ({
          runId: "run-1",
          appName: "@elizaos/app-babylon",
          displayName: "Babylon",
          session: null,
          health: {
            state: "healthy",
            message: null,
          },
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(501);
    expect(getJson()).toEqual({
      success: false,
      message:
        'Run-scoped controls are unavailable for "Babylon" because its route module does not expose a steering handler.',
      disposition: "unsupported",
      status: 501,
      run: {
        runId: "run-1",
        appName: "@elizaos/app-babylon",
        displayName: "Babylon",
        session: null,
        health: {
          state: "healthy",
          message: null,
        },
      },
      session: null,
    });
  });

  test("POST /api/apps/runs/:runId/attach returns 404 on missing run", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const runtime = { agentId: "runtime-agent-id" } as IAgentRuntime;
    const attachRun = vi.fn(
      async (_runId: string, _runtime?: IAgentRuntime | null) => ({
        success: false,
        message: 'App run "run-404" was not found.',
      }),
    );
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-404/attach",
      res,
      runtime,
      appManager: buildAppManager({
        attachRun,
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(attachRun).toHaveBeenCalledWith("run-404", runtime);
    expect(getStatus()).toBe(404);
    expect(getJson()).toEqual({
      success: false,
      message: 'App run "run-404" was not found.',
    });
  });

  test("POST /api/apps/runs/:runId/detach detaches an active run", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/detach",
      res,
      appManager: buildAppManager({
        detachRun: vi.fn(async () => ({
          success: true,
          message: "Hyperscape detached.",
          run: {
            runId: "run-1",
            viewerAttachment: "detached",
          },
        })),
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      success: true,
      message: "Hyperscape detached.",
      run: {
        runId: "run-1",
        viewerAttachment: "detached",
      },
    });
  });

  test("POST /api/apps/runs/:runId/stop delegates to appManager.stop by run id", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const pluginManager = buildPluginManager();
    const stop = vi.fn(async () => ({
      success: true,
      appName: "@hyperscape/plugin-hyperscape",
      runId: "run-1",
      stoppedAt: "2026-04-06T00:00:00.000Z",
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "Hyperscape stopped.",
    }));
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/runs/run-1/stop",
      res,
      getPluginManager: () => pluginManager,
      appManager: buildAppManager({
        stop,
      }),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(stop).toHaveBeenCalledWith(pluginManager, "", "run-1");
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      success: true,
      appName: "@hyperscape/plugin-hyperscape",
      runId: "run-1",
      stoppedAt: "2026-04-06T00:00:00.000Z",
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "Hyperscape stopped.",
    });
  });

  test("POST /api/apps/stop rejects requests without name or runId", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const ctx = buildCtx({
      method: "POST",
      pathname: "/api/apps/stop",
      res,
      readJsonBody: vi.fn(async () => ({})),
    });

    const handled = await handleAppsRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(500);
    expect(getJson()).toEqual({
      error: "name or runId is required",
    });
  });
});
