import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type RouteLogger = {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  listTrajectories: () => Promise<{
    trajectories: Array<Record<string, unknown>>;
    total: number;
    offset: number;
    limit: number;
  }>;
  getTrajectoryDetail: (trajectoryId: string) => Promise<unknown>;
  getStats: () => Promise<Record<string, unknown>>;
  deleteTrajectories: (trajectoryIds: string[]) => Promise<number>;
  clearAllTrajectories: () => Promise<number>;
  exportTrajectories: () => Promise<{
    data: string;
    filename: string;
    mimeType: string;
  }>;
  exportTrajectoriesZip?: (options: Record<string, unknown>) => Promise<{
    filename: string;
    entries: Array<{ name: string; data: string }>;
  }>;
};

type RuntimeLike = AgentRuntime & {
  adapter?: unknown;
  getServiceRegistrationStatus?: (
    serviceType: string,
  ) => "pending" | "registering" | "registered" | "failed" | "unknown";
  getServiceLoadPromise?: (serviceType: string) => Promise<unknown>;
};

function createTrajectoryRuntime(
  overrides: Partial<RuntimeLike> = {},
): RuntimeLike {
  const runtime = {
    agentId: "trajectory-routes-agent",
    character: {
      name: "TrajectoryRoutesAgent",
    } as AgentRuntime["character"],
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as AgentRuntime["logger"],
    adapter: {},
    getSetting: () => undefined,
    getAgent: async () => null,
    getRoomsByWorld: async () => [],
    getService: () => null,
    getServicesByType: () => [],
    ...overrides,
  } as RuntimeLike;

  return runtime;
}

function createCompatibleLogger(
  overrides: Partial<RouteLogger> = {},
): RouteLogger {
  return {
    isEnabled: () => true,
    setEnabled: () => {},
    listTrajectories: async () => ({
      trajectories: [
        {
          id: "trajectory-routes-1",
          agentId: "trajectory-routes-agent",
          source: "client_chat",
          status: "completed",
          startTime: Date.now() - 1_000,
          endTime: Date.now(),
          durationMs: 1_000,
          stepCount: 1,
          llmCallCount: 1,
          providerAccessCount: 0,
          totalPromptTokens: 12,
          totalCompletionTokens: 18,
          totalReward: 0,
          scenarioId: null,
          batchId: null,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      offset: 0,
      limit: 50,
    }),
    getTrajectoryDetail: async () => null,
    getStats: async () => ({
      totalTrajectories: 1,
      totalSteps: 1,
      totalLlmCalls: 1,
      totalPromptTokens: 12,
      totalCompletionTokens: 18,
      averageDurationMs: 1_000,
      averageReward: 0,
      bySource: { client_chat: 1 },
      byStatus: { completed: 1 },
      byScenario: {},
    }),
    deleteTrajectories: async () => 0,
    clearAllTrajectories: async () => 0,
    exportTrajectories: async () => ({
      data: "[]",
      filename: "trajectories.json",
      mimeType: "application/json",
    }),
    ...overrides,
  };
}

describe("trajectory routes", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await server.close();
      }
    }
  });

  it("waits for a pending trajectory logger to finish loading before listing trajectories", async () => {
    const coreLogger = {
      logLlmCall: () => {},
    };
    const compatibleLogger = createCompatibleLogger();
    let ready = false;
    let loadRequested = false;

    const runtime = createTrajectoryRuntime({
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories"
          ? ready
            ? [coreLogger, compatibleLogger]
            : [coreLogger]
          : [],
      getService: (serviceType: string) =>
        serviceType === "trajectories" && ready ? compatibleLogger : null,
      getServiceRegistrationStatus: (serviceType: string) =>
        serviceType === "trajectories" && !ready ? "pending" : "registered",
      getServiceLoadPromise: async (serviceType: string) => {
        expect(serviceType).toBe("trajectories");
        loadRequested = true;
        await new Promise((resolve) => setTimeout(resolve, 25));
        ready = true;
      },
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories?limit=10");

    expect(loadRequested).toBe(true);
    expect(ready).toBe(true);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.data.trajectories)).toBe(true);
    expect(response.data.trajectories[0]?.id).toBe("trajectory-routes-1");
  });

  it("returns 503 when trajectory listing is requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories?limit=10");

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("returns 503 when ZIP export is requested but unavailable in the logger", async () => {
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? createCompatibleLogger() : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [createCompatibleLogger()] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "zip",
    });

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectory ZIP export is unavailable in the active logger",
    );
  });

  it("returns 503 when trajectory export is requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "json",
    });

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("returns 503 when trajectory deletion is requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "DELETE", "/api/trajectories", {
      clearAll: true,
    });

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("rejects invalid trajectory export formats", async () => {
    const logger = createCompatibleLogger();
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "yaml",
    });

    expect(response.status).toBe(400);
    expect(String(response.data.error)).toContain(
      "Format must be 'json', 'csv', 'art', or 'zip'",
    );
  });

  it("returns stats from the active trajectory logger", async () => {
    const logger = createCompatibleLogger({
      getStats: async () => ({
        totalTrajectories: 7,
        totalSteps: 9,
        totalLlmCalls: 11,
        totalPromptTokens: 123,
        totalCompletionTokens: 456,
        averageDurationMs: 789,
        averageReward: 1.5,
        bySource: { client_chat: 5, discord: 2 },
        byStatus: { completed: 6, active: 1 },
        byScenario: { eval: 3 },
      }),
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories/stats");

    expect(response.status).toBe(200);
    expect(response.data.totalTrajectories).toBe(7);
    expect(response.data.totalCompletionTokens).toBe(456);
    expect(response.data.bySource).toEqual({ client_chat: 5, discord: 2 });
  });

  it("returns 503 when trajectory stats are requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories/stats");

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("round-trips trajectory logger config through GET and PUT", async () => {
    let enabled = true;
    const logger = createCompatibleLogger({
      isEnabled: () => enabled,
      setEnabled: (nextEnabled) => {
        enabled = nextEnabled;
      },
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const before = await req(server.port, "GET", "/api/trajectories/config");
    expect(before.status).toBe(200);
    expect(before.data.enabled).toBe(true);

    const update = await req(server.port, "PUT", "/api/trajectories/config", {
      enabled: false,
    });
    expect(update.status).toBe(200);
    expect(update.data.enabled).toBe(false);

    const after = await req(server.port, "GET", "/api/trajectories/config");
    expect(after.status).toBe(200);
    expect(after.data.enabled).toBe(false);
  });

  it("returns 503 when trajectory config updates are requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "PUT", "/api/trajectories/config", {
      enabled: false,
    });

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("returns 503 when trajectory config is requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "GET", "/api/trajectories/config");

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("returns trajectory detail records from the logger", async () => {
    const startedAt = Date.now() - 2_000;
    const finishedAt = Date.now() - 1_000;
    const logger = createCompatibleLogger({
      getTrajectoryDetail: async (trajectoryId: string) => ({
        trajectoryId,
        agentId: "trajectory-routes-agent",
        startTime: startedAt,
        endTime: finishedAt,
        durationMs: finishedAt - startedAt,
        metadata: {
          source: "client_chat",
        },
        metrics: {
          finalStatus: "completed",
        },
        steps: [
          {
            stepId: "detail-step-1",
            timestamp: startedAt + 100,
            llmCalls: [
              {
                callId: "detail-call-1",
                model: "gpt-5.4",
                userPrompt: "trajectory prompt",
                response: "trajectory response",
                timestamp: startedAt + 150,
                promptTokens: 12,
                completionTokens: 18,
              },
            ],
          },
        ],
      }),
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(
      server.port,
      "GET",
      "/api/trajectories/trajectory-detail-1",
    );

    expect(response.status).toBe(200);
    expect(response.data.trajectory?.id).toBe("trajectory-detail-1");
    expect(response.data.trajectory?.status).toBe("completed");
    expect(response.data.llmCalls?.[0]?.userPrompt).toBe("trajectory prompt");
    expect(response.data.llmCalls?.[0]?.response).toBe("trajectory response");
  });

  it("returns 503 when trajectory detail is requested without a logger service", async () => {
    const runtime = createTrajectoryRuntime({
      getService: () => null,
      getServicesByType: () => [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(
      server.port,
      "GET",
      "/api/trajectories/trajectory-detail-missing",
    );

    expect(response.status).toBe(503);
    expect(String(response.data.error)).toContain(
      "Trajectories service not available",
    );
  });

  it("returns downloadable JSON exports with the requested filters", async () => {
    const exportTrajectories = async (options: Record<string, unknown>) => {
      expect(options).toEqual({
        format: "json",
        includePrompts: true,
        trajectoryIds: ["trajectory-a"],
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-02T00:00:00.000Z",
        scenarioId: "scenario-1",
        batchId: "batch-1",
      });
      return {
        data: '[{"id":"trajectory-a"}]',
        filename: "trajectory-export.json",
        mimeType: "application/json",
      };
    };
    const logger = createCompatibleLogger({
      exportTrajectories,
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "POST", "/api/trajectories/export", {
      format: "json",
      includePrompts: true,
      trajectoryIds: ["trajectory-a"],
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-02T00:00:00.000Z",
      scenarioId: "scenario-1",
      batchId: "batch-1",
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(String(response.headers["content-disposition"])).toContain(
      'attachment; filename="trajectory-export.json"',
    );
    expect(response.data as unknown).toEqual([{ id: "trajectory-a" }]);
  });

  it("deletes only the requested trajectory ids", async () => {
    const deleteTrajectories = async (trajectoryIds: string[]) => {
      expect(trajectoryIds).toEqual(["trajectory-a", "trajectory-b"]);
      return trajectoryIds.length;
    };
    const logger = createCompatibleLogger({
      deleteTrajectories,
    });
    const runtime = createTrajectoryRuntime({
      getService: (serviceType: string) =>
        serviceType === "trajectories" ? logger : null,
      getServicesByType: (serviceType: string) =>
        serviceType === "trajectories" ? [logger] : [],
    });

    const server = await startApiServer({ port: 0, runtime });
    servers.push(server);

    const response = await req(server.port, "DELETE", "/api/trajectories", {
      trajectoryIds: ["trajectory-a", "trajectory-b"],
    });

    expect(response.status).toBe(200);
    expect(response.data.deleted).toBe(2);
  });
});
