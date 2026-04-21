/**
 * E2E regression coverage for coding-agent startup polling routes.
 *
 * Uses the real API server and real route ordering. The runtime is intentionally
 * minimal so the server reaches the "runtime exists but coding-agent services do
 * not" state that previously returned plugin-driven 503 responses.
 */
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

function createRuntimeWithoutCodingAgentServices(): AgentRuntime {
  return {
    agentId: "00000000-0000-0000-0000-000000000001",
    character: { name: "Test Agent" },
    plugins: [],
    getService: () => null,
    hasService: () => false,
    getServiceLoadPromise: async () => null,
    getSetting: () => undefined,
  } as unknown as AgentRuntime;
}

describe("Coding agent route readiness", () => {
  let server: {
    port: number;
    close: () => Promise<void>;
  } | null = null;

  beforeAll(async () => {
    server = await startApiServer({
      port: 0,
      runtime: createRuntimeWithoutCodingAgentServices(),
    });
  }, 60_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("returns empty coordinator status instead of 503 when the coordinator is unavailable", async () => {
    const response = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/coordinator/status",
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      supervisionLevel: "autonomous",
      taskCount: 0,
      tasks: [],
      recentTasks: [],
      taskThreadCount: 0,
      taskThreads: [],
      pendingConfirmations: 0,
      frameworks: [],
    });
  });

  it("returns empty preflight instead of 503 when PTY service is unavailable", async () => {
    const response = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/preflight",
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual([]);
  });

  it("returns empty task and session lists for startup polling before services exist", async () => {
    const tasks = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/tasks",
    );
    const sessions = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/sessions",
    );

    expect(tasks.status).toBe(200);
    expect(tasks.data).toEqual({ tasks: [] });
    expect(sessions.status).toBe(200);
    expect(sessions.data).toEqual({ sessions: [] });
  });

  it("returns not found for task and session detail polling before services exist", async () => {
    const task = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/tasks/nonexistent-task",
    );
    const session = await req(
      server?.port ?? 0,
      "GET",
      "/api/coding-agents/sessions/nonexistent-session",
    );

    expect(task.status).toBe(404);
    expect(task.data).toMatchObject({ error: "Task not found" });
    expect(session.status).toBe(404);
    expect(session.data).toMatchObject({ error: "Session not found" });
  });
});
