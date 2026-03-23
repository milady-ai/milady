import crypto from "node:crypto";
import {
  type AgentRuntime,
  stringToUuid,
  type Task,
  type UUID,
} from "@elizaos/core";
import { startApiServer } from "@miladyai/app-core/src/api/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "./helpers/http";

interface TriggerRuntimeHarness {
  runtime: AgentRuntime;
  injectAutonomousInstruction: ReturnType<typeof vi.fn>;
}

function createTriggerRuntimeHarness(): TriggerRuntimeHarness {
  let tasks: Task[] = [];
  const injectAutonomousInstruction = vi.fn(
    async (_params: {
      instructions: string;
      source: string;
      wakeMode: "inject_now" | "next_autonomy_cycle";
      triggerId: UUID;
      triggerTaskId: UUID;
    }) => undefined,
  );

  const runtimePartial: Partial<AgentRuntime> = {
    agentId: "00000000-0000-0000-0000-000000000001" as UUID,
    character: { name: "TriggerRuntimeE2E" } as AgentRuntime["character"],
    getSetting: (_key: string) => undefined,
    getService: (serviceType: string) => {
      if (serviceType !== "AUTONOMY") return null;
      return {
        getAutonomousRoomId: () =>
          "00000000-0000-0000-0000-000000000201" as UUID,
        injectAutonomousInstruction,
      } as {
        getAutonomousRoomId: () => UUID;
        injectAutonomousInstruction: (params: {
          instructions: string;
          source: string;
          wakeMode: "inject_now" | "next_autonomy_cycle";
          triggerId: UUID;
          triggerTaskId: UUID;
        }) => Promise<void>;
      };
    },
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    getRoomsByWorld: async () => [],
    createTask: async (task: Task) => {
      const id = stringToUuid(crypto.randomUUID());
      const created: Task = {
        ...task,
        id,
      };
      tasks.push(created);
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      tasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...(task.metadata ?? {}),
                ...(update.metadata ?? {}),
              },
            }
          : task,
      );
    },
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    createMemory: vi.fn(async () => undefined),
    getTaskWorker: vi.fn(),
    registerTaskWorker: vi.fn(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as AgentRuntime["logger"],
  };

  return {
    runtime: runtimePartial as unknown as AgentRuntime,
    injectAutonomousInstruction,
  };
}

describe("Trigger runtime E2E", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;
  let harness: TriggerRuntimeHarness;

  beforeAll(async () => {
    harness = createTriggerRuntimeHarness();
    server = await startApiServer({
      port: 0,
      runtime: harness.runtime,
    });
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it("creates a trigger, executes it, records run history, and dispatches autonomy", async () => {
    if (!server) {
      throw new Error("Server was not initialized");
    }

    const createResponse = await req(
      server.port,
      "POST",
      "/api/triggers",
      {
        displayName: "Heartbeat runtime e2e",
        instructions: "Send a runtime heartbeat update",
        triggerType: "interval",
        intervalMs: 60_000,
        wakeMode: "inject_now",
      },
    );

    expect(createResponse.status).toBe(201);
    const createBody = createResponse.data as Record<string, unknown>;
    const trigger = (createBody.trigger ?? {}) as Record<string, unknown>;
    const triggerId = String(trigger.id ?? "");
    expect(triggerId.length).toBeGreaterThan(0);

    const executeResponse = await req(
      server.port,
      "POST",
      `/api/triggers/${encodeURIComponent(triggerId)}/execute`,
    );
    expect(executeResponse.status).toBe(200);
    const executeBody = executeResponse.data as Record<string, unknown>;
    const executeResult = (executeBody.result ?? {}) as Record<string, unknown>;
    expect(executeResult.status).toBe("success");
    expect(harness.injectAutonomousInstruction).toHaveBeenCalledTimes(1);

    const runsResponse = await req(
      server.port,
      "GET",
      `/api/triggers/${encodeURIComponent(triggerId)}/runs`,
    );
    expect(runsResponse.status).toBe(200);
    const runsBody = runsResponse.data as Record<string, unknown>;
    const runs = (runsBody.runs ?? []) as unknown[];
    expect(runs.length).toBe(1);
    const run = (runs[0] ?? {}) as Record<string, unknown>;
    expect(run.status).toBe("success");
    expect(run.source).toBe("manual");

    const healthResponse = await req(
      server.port,
      "GET",
      "/api/triggers/health",
    );
    expect(healthResponse.status).toBe(200);
    const health = healthResponse.data as Record<string, unknown>;
    expect(Number(health.totalExecutions ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(health.totalFailures ?? 0)).toBe(0);
  });
});
