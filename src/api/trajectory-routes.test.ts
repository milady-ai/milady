import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import { handleTrajectoryRoute } from "./trajectory-routes";

function makeLegacyLogger(
  overrides: {
    listTrajectories?: () => Promise<{
      trajectories: unknown[];
      total: number;
      offset: number;
      limit: number;
    }>;
    getTrajectoryDetail?: () => Promise<unknown>;
    getStats?: () => Promise<unknown>;
    deleteTrajectories?: () => Promise<number>;
    clearAllTrajectories?: () => Promise<number>;
    exportTrajectories?: () => Promise<{
      data: string;
      filename: string;
      mimeType: string;
    }>;
    isEnabled?: () => boolean;
    setEnabled?: (enabled: boolean) => void;
  } = {},
) {
  return {
    isEnabled: vi.fn(() => true),
    setEnabled: vi.fn(),
    listTrajectories: vi
      .fn()
      .mockResolvedValue({
        trajectories: [
          {
            id: "trajectory-1",
            source: "runtime",
            status: "completed",
            startTime: 1_700_000_000_000,
            endTime: 1_700_000_000_500,
            durationMs: 500,
            llmCallCount: 1,
            totalPromptTokens: 10,
            totalCompletionTokens: 12,
            metadata: { roomId: "room-1" },
            stepCount: 1,
            totalReward: 1,
            stepCountPerSec: 0,
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
        ...overrides,
      })
      .mockName("listTrajectories"),
    getTrajectoryDetail: vi.fn().mockResolvedValue({
      trajectoryId: "trajectory-1",
      agentId: "agent-1",
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_000_500,
      durationMs: 500,
      steps: [],
      totalReward: 1,
      metrics: { episodeLength: 1, finalStatus: "completed" },
      metadata: { source: "runtime", roomId: "room-1" },
    }),
    getStats: vi.fn().mockResolvedValue({
      totalTrajectories: 1,
      totalLlmCalls: 1,
      totalPromptTokens: 10,
      totalCompletionTokens: 12,
      averageDurationMs: 500,
      bySource: { runtime: 1 },
      byModel: { "gpt-4": 1 },
    }),
    deleteTrajectories: vi.fn().mockResolvedValue(1),
    clearAllTrajectories: vi.fn().mockResolvedValue(1),
    exportTrajectories: vi.fn().mockResolvedValue({
      data: '[{"trajectoryId":"trajectory-1"}]',
      filename: "trajectories.json",
      mimeType: "application/json",
    }),
    ...overrides,
  };
}

function makeRuntime(
  services: unknown[],
  options: {
    useGetService?: boolean;
    adapter?: Record<string, unknown>;
  } = {},
): AgentRuntime {
  return {
    adapter: options.adapter ?? { db: {} },
    getServicesByType: () => services,
    ...(options.useGetService ? { getService: () => services[0] } : {}),
  } as AgentRuntime;
}

describe("handleTrajectoryRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for unrelated routes", async () => {
    const runtime = makeRuntime([]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/unknown",
      }),
      res,
      runtime,
      "/api/unknown",
    );

    expect(handled).toBe(false);
    expect(getStatus()).toBe(200);
  });

  it("returns 503 when runtime adapter is unavailable", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {} as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toContain("Database not available");
  });

  it("returns listed trajectories via getService compatibility", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger], { useGetService: true });

    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories?limit=10&status=completed",
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const payload = getJson<{
      trajectories: Array<{ id: string; status: string; source: string }>;
      total: number;
      offset: number;
      limit: number;
    }>();
    expect(payload.trajectories[0].id).toBe("trajectory-1");
    expect(logger.listTrajectories).toHaveBeenCalledOnce();
    expect(
      (logger.listTrajectories as ReturnType<typeof vi.fn>).mock.calls[0],
    ).toEqual([
      expect.objectContaining({
        limit: 10,
        status: "completed",
      }),
    ]);
    expect(payload.total).toBe(1);
  });

  it("returns 503 when getServicesByType has no trajectory logger", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories",
      }),
      res,
      {
        adapter: { db: {} },
        getServicesByType: () => "invalid" as unknown as unknown[],
      } as unknown as AgentRuntime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("Trajectory logger service not available");
  });

  it("returns trajectory stats from logger", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);

    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/stats",
      }),
      res,
      runtime,
      "/api/trajectories/stats",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      totalTrajectories: 1,
      totalLlmCalls: 1,
      totalProviderAccesses: 0,
      totalPromptTokens: 10,
      totalCompletionTokens: 12,
      averageDurationMs: 500,
      bySource: { runtime: 1 },
      byModel: {},
    });
  });

  it("reads and returns trajectory config enabled state", async () => {
    const logger = makeLegacyLogger({ isEnabled: vi.fn(() => false) });
    const runtime = makeRuntime([logger]);

    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/config",
      }),
      res,
      runtime,
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ enabled: false });
  });

  it("updates trajectory logging enabled state from request body", async () => {
    const logger = makeLegacyLogger({ isEnabled: vi.fn(() => false) });
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "PUT",
        url: "/api/trajectories/config",
        body: { enabled: false },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(logger.setEnabled).toHaveBeenCalledWith(false);
    expect(getJson()).toEqual({ enabled: false });
  });

  it("validates export format", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "zip" },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toBe("Format must be 'json', 'csv', or 'art'");
  });

  it("streams JSON export payload", async () => {
    const logger = makeLegacyLogger({
      exportTrajectories: vi.fn().mockResolvedValue({
        data: '[{"trajectoryId":"trajectory-1"}]',
        filename: "trajectories.json",
        mimeType: "application/json",
      }),
    });
    const runtime = makeRuntime([logger]);
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/trajectories/export",
        body: { format: "json" },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories/export",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect((res as { _body: string })._body).toContain("trajectory-1");
  });

  it("returns 404 when trajectory detail is missing", async () => {
    const logger = makeLegacyLogger({
      getTrajectoryDetail: vi.fn().mockResolvedValue(null),
    });
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/missing",
      }),
      res,
      runtime,
      "/api/trajectories/missing",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(404);
    expect(getJson().error).toBe('Trajectory "missing" not found');
  });

  it("loads trajectory detail", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/trajectories/trajectory-1",
      }),
      res,
      runtime,
      "/api/trajectories/trajectory-1",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      trajectory: expect.objectContaining({
        id: "trajectory-1",
        status: "completed",
      }),
      llmCalls: [],
      providerAccesses: [],
    });
  });

  it("deletes specific trajectory IDs", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { trajectoryIds: ["trajectory-1", "trajectory-2"] },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(
      (logger.deleteTrajectories as ReturnType<typeof vi.fn>).mock.calls[0],
    ).toEqual([["trajectory-1", "trajectory-2"]]);
    expect(getJson()).toEqual({ deleted: 1 });
  });

  it("clears all trajectories", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: { clearAll: true },
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(logger.clearAllTrajectories).toHaveBeenCalledOnce();
    expect(getJson()).toEqual({ deleted: 1 });
  });

  it("returns 400 for invalid delete payload", async () => {
    const logger = makeLegacyLogger();
    const runtime = makeRuntime([logger]);
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleTrajectoryRoute(
      createMockIncomingMessage({
        method: "DELETE",
        url: "/api/trajectories",
        body: {},
        json: true,
      }),
      res,
      runtime,
      "/api/trajectories",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toContain("Request must include 'trajectoryIds'");
  });
});
