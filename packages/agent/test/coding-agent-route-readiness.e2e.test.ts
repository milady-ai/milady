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
    expect(response.data).toEqual({
      supervisionLevel: "autonomous",
      taskCount: 0,
      tasks: [],
      pendingConfirmations: 0,
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
});
