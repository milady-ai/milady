import crypto from "node:crypto";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";
import { LifeOpsRepository } from "../src/lifeops/repository";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";
import { req } from "../../../test/helpers/http";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
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

function createRuntimeForPerformanceTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-performance-agent",
    character: { name: "LifeOpsPerformanceAgent" } as AgentRuntime["character"],
    getSetting: () => undefined,
    getService: () => null,
    getRoomsByWorld: async () => [],
    getTasks: async (query?: { tags?: string[] }) => {
      if (!query?.tags || query.tags.length === 0) return tasks;
      return tasks.filter((task) =>
        query.tags?.every((tag) => task.tags?.includes(tag)),
      );
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    createTask: async (task: Task) => {
      const id = (task.id as UUID | undefined) ?? (crypto.randomUUID() as UUID);
      tasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      tasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...((task.metadata as Record<string, unknown> | undefined) ??
                  {}),
                ...((update.metadata as Record<string, unknown> | undefined) ??
                  {}),
              } as Task["metadata"],
            }
          : task,
      );
    },
    deleteTask: async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    },
    adapter: {
      db: {
        execute: async (query: SqlQuery) => {
          const sql = extractSqlText(query).trim();
          if (sql.length === 0) return [];
          if (/^(select|pragma)\b/i.test(sql)) {
            return sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
          }
          sqlite.exec(sql);
          return [];
        },
      },
    },
  };

  return runtimeSubset as unknown as AgentRuntime;
}

async function createReminderDefinitionBatch(
  port: number,
  batchStart: number,
  batchSize: number,
): Promise<void> {
  await Promise.all(
    Array.from({ length: batchSize }, (_, offset) => {
      const index = batchStart + offset;
      return req(port, "POST", "/api/lifeops/definitions", {
        kind: "task",
        title: `Performance task ${index}`,
        timezone: "UTC",
        priority: 2,
        cadence: {
          kind: "once",
          dueAt: "2026-04-04T16:00:00.000Z",
          visibilityLeadMinutes: 0,
          visibilityLagMinutes: 180,
        },
        reminderPlan: {
          steps: [
            {
              channel: "in_app",
              offsetMinutes: 0,
              label: "In-app now",
            },
          ],
        },
      }).then((response) => {
        expect(response.status).toBe(201);
      });
    }),
  );
}

describe("life-ops performance", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let runtime: AgentRuntime;

  beforeAll(async () => {
    runtime = createRuntimeForPerformanceTests();
    const server = await startApiServer({
      port: 0,
      runtime,
    });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("processes 120 due in-app reminders within 4 seconds and records each attempt", async () => {
    const totalDefinitions = 120;
    const batchSize = 20;
    for (let index = 0; index < totalDefinitions; index += batchSize) {
      await createReminderDefinitionBatch(
        port,
        index,
        Math.min(batchSize, totalDefinitions - index),
      );
    }

    const startedAt = performance.now();
    const processRes = await req(
      port,
      "POST",
      "/api/lifeops/reminders/process",
      {
        now: "2026-04-04T16:05:00.000Z",
        limit: totalDefinitions,
      },
    );
    const durationMs = performance.now() - startedAt;

    expect(processRes.status).toBe(200);
    const attempts = processRes.data.attempts as Array<Record<string, unknown>>;
    expect(attempts).toHaveLength(totalDefinitions);
    expect(
      attempts.every(
        (attempt) =>
          attempt.channel === "in_app" && attempt.outcome === "delivered",
      ),
    ).toBe(true);
    expect(durationMs).toBeLessThan(4_000);

    const repository = new LifeOpsRepository(runtime);
    const storedAttempts = await repository.listReminderAttempts(
      "lifeops-performance-agent",
    );
    expect(storedAttempts).toHaveLength(totalDefinitions);
    expect(
      new Set(storedAttempts.map((attempt) => attempt.deliveryMetadata.message))
        .size,
    ).toBe(totalDefinitions);
  }, 60_000);
});
