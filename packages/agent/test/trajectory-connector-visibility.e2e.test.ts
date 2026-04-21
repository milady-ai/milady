import { PGlite } from "@electric-sql/pglite";
import { type AgentRuntime, TrajectoriesService } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

type TestRuntime = AgentRuntime & {
  adapter: {
    db: {
      execute: (query: SqlQuery) => Promise<{
        rows: Array<Record<string, unknown>>;
        fields: Array<{ name: string }>;
      }>;
    };
  };
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

describe("Connector trajectory visibility", () => {
  let db: PGlite;
  let runtime: TestRuntime;
  let trajectoryLogger: TrajectoriesService;
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    db = new PGlite();

    runtime = {
      agentId: "trajectory-connector-visibility-agent",
      character: {
        name: "TrajectoryConnectorVisibilityAgent",
      } as AgentRuntime["character"],
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      } as AgentRuntime["logger"],
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const result = await db.query<Record<string, unknown>>(
              extractSqlText(query),
            );
            return {
              rows: result.rows,
              fields: (result.fields ?? []).map((field) => ({
                name: field.name,
              })),
            };
          },
        },
      },
      getSetting: () => undefined,
      getAgent: async () => null,
      getRoomsByWorld: async () => [],
      getService: () => null,
      getServicesByType: () => [],
    } as TestRuntime;

    trajectoryLogger = new TrajectoriesService(runtime);
    await trajectoryLogger.initialize();

    runtime.getService = ((serviceType: string) =>
      serviceType === "trajectories" ? trajectoryLogger : null) as AgentRuntime["getService"];
    runtime.getServicesByType = ((serviceType: string) =>
      serviceType === "trajectories"
        ? [trajectoryLogger]
        : []) as AgentRuntime["getServicesByType"];

    server = await startApiServer({ port: 0, runtime });
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    await db.close();
  });

  async function createTrajectory(
    source: string,
    prompt: string,
    response: string,
  ): Promise<string> {
    const trajectoryId = await trajectoryLogger.startTrajectory(runtime.agentId, {
      source,
      metadata: {
        roomId: `${source}-room`,
        entityId: `${source}-user`,
        messageId: `${source}-message`,
      },
    });
    const stepId = trajectoryLogger.startStep(trajectoryId, {
      timestamp: Date.now() - 1_000,
      agentBalance: 0,
      agentPoints: 0,
      agentPnL: 0,
      openPositions: 0,
    });
    const startTime = Date.now() - 900;

    trajectoryLogger.logLlmCall({
      stepId,
      callId: `${trajectoryId}-call-1`,
      timestamp: startTime + 20,
      model: "test-model",
      systemPrompt:
        "You are a connector trajectory visibility regression test agent.",
      userPrompt: prompt,
      response,
      temperature: 0,
      maxTokens: 256,
      purpose: "response",
      actionType: "runtime.useModel",
      latencyMs: 5,
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(response.length / 4),
    });
    trajectoryLogger.completeStep(trajectoryId, stepId, {
      actionType: "RESPOND",
      actionName: "RESPOND",
      parameters: {},
      success: true,
    });
    await trajectoryLogger.endTrajectory(trajectoryId, "completed");

    return trajectoryId;
  }

  it("lists, hydrates, and deletes connector-sourced trajectories through the API", async () => {
    if (!server) {
      throw new Error("API server did not start");
    }

    const prompt = "hello from the discord connector";
    const response = "Hello from connector!";
    const trajectoryId = await createTrajectory("discord", prompt, response);

    const list = await req(server.port, "GET", "/api/trajectories?limit=20");
    expect(list.status).toBe(200);
    expect(
      Array.isArray(list.data.trajectories) &&
        list.data.trajectories.some(
          (item: { id?: string; source?: string; llmCallCount?: number }) =>
            item.id === trajectoryId &&
            item.source === "discord" &&
            Number(item.llmCallCount ?? 0) === 1,
        ),
    ).toBe(true);

    const detail = await req(
      server.port,
      "GET",
      `/api/trajectories/${encodeURIComponent(trajectoryId)}`,
    );
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.data.llmCalls)).toBe(true);
    expect(detail.data.llmCalls[0]?.userPrompt).toBe(prompt);
    expect(detail.data.llmCalls[0]?.response).toBe(response);

    const deleteResponse = await req(
      server.port,
      "DELETE",
      "/api/trajectories",
      {
        trajectoryIds: [trajectoryId],
      },
    );
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.data.deleted).toBe(1);

    const detailAfterDelete = await req(
      server.port,
      "GET",
      `/api/trajectories/${encodeURIComponent(trajectoryId)}`,
    );
    expect(detailAfterDelete.status).toBe(404);

    const listAfterDelete = await req(
      server.port,
      "GET",
      "/api/trajectories?limit=20",
    );
    expect(
      Array.isArray(listAfterDelete.data.trajectories) &&
        listAfterDelete.data.trajectories.some(
          (item: { id?: string }) => item.id === trajectoryId,
        ),
    ).toBe(false);
  });

  it("supports clear-all and empty delete payloads through the API", async () => {
    if (!server) {
      throw new Error("API server did not start");
    }

    const firstId = await createTrajectory(
      "discord",
      "first connector prompt",
      "first connector response",
    );
    const secondId = await createTrajectory(
      "telegram",
      "second connector prompt",
      "second connector response",
    );

    const emptyDelete = await req(server.port, "DELETE", "/api/trajectories", {});
    expect(emptyDelete.status).toBe(200);
    expect(emptyDelete.data.deleted).toBe(0);

    const clearAllResponse = await req(server.port, "DELETE", "/api/trajectories", {
      clearAll: true,
    });
    expect(clearAllResponse.status).toBe(200);
    expect(clearAllResponse.data.deleted).toBeGreaterThanOrEqual(2);

    const listAfterClear = await req(
      server.port,
      "GET",
      "/api/trajectories?limit=20",
    );
    expect(listAfterClear.status).toBe(200);
    expect(
      Array.isArray(listAfterClear.data.trajectories) &&
        listAfterClear.data.trajectories.some(
          (item: { id?: string }) => item.id === firstId || item.id === secondId,
        ),
    ).toBe(false);
  });

  it("rejects malformed delete payloads with a 400 response", async () => {
    if (!server) {
      throw new Error("API server did not start");
    }

    const response = await fetch(
      `http://127.0.0.1:${server.port}/api/trajectories`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid JSON in request body",
    });
  });
});
