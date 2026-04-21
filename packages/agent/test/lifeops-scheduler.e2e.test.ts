import crypto from "node:crypto";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";
import { DatabaseSync } from "../src/test-utils/sqlite-compat";
import {
  ensureLifeOpsSchedulerTask,
  LIFEOPS_TASK_NAME,
  registerLifeOpsTaskWorker,
} from "../src/lifeops/runtime";

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

function createAgentEventServiceStub() {
  const listeners = new Set<
    (event: {
      runId: string;
      seq: number;
      stream: string;
      ts: number;
      data: Record<string, unknown>;
      agentId?: string;
      roomId?: UUID;
    }) => void
  >();
  let seq = 0;
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    service: {
      subscribe: (
        listener: (event: {
          runId: string;
          seq: number;
          stream: string;
          ts: number;
          data: Record<string, unknown>;
          agentId?: string;
          roomId?: UUID;
        }) => void,
      ) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeHeartbeat: () => () => {},
      emit: (event: {
        runId: string;
        stream: string;
        data: Record<string, unknown>;
        agentId?: string;
        roomId?: UUID;
      }) => {
        const payload = {
          ...event,
          seq: ++seq,
          ts: Date.now(),
        };
        events.push(payload);
        for (const listener of listeners) {
          listener(payload);
        }
      },
    },
  };
}

function createRuntimeForSchedulerTests() {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const workerRegistry = new Map<string, unknown>();
  const agentEvents = createAgentEventServiceStub();
  const autonomyService = {
    getAutonomousRoomId: () => "lifeops-autonomy-room" as UUID,
  };

  const runtimeSubset = {
    agentId: "lifeops-scheduler-agent",
    character: { name: "LifeOpsSchedulerAgent" } as AgentRuntime["character"],
    getSetting: () => undefined,
    getService: (serviceType: string) => {
      if (serviceType === "AUTONOMY") {
        return autonomyService;
      }
      if (serviceType === "agent_event" || serviceType === "AGENT_EVENT") {
        return agentEvents.service;
      }
      return null;
    },
    getRoomsByWorld: async () => [],
    createMemory: async () => crypto.randomUUID(),
    getTasks: async () => tasks,
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
    registerTaskWorker: (worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    },
    getTaskWorker: (name: string) => workerRegistry.get(name),
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

  return {
    runtime: runtimeSubset as unknown as AgentRuntime,
    agentEvents,
  };
}

describe("LifeOps scheduler E2E", () => {
  let port: number;
  let close: () => Promise<void>;
  let runtimeFixture: ReturnType<typeof createRuntimeForSchedulerTests>;

  beforeAll(async () => {
    runtimeFixture = createRuntimeForSchedulerTests();
    registerLifeOpsTaskWorker(runtimeFixture.runtime);
    await ensureLifeOpsSchedulerTask(runtimeFixture.runtime);
    const server = await startApiServer({
      port: 0,
      runtime: runtimeFixture.runtime,
    });
    port = server.port;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it("runs reminders and scheduled workflows through the persistent task worker", async () => {
    const now = new Date();
    now.setSeconds(0, 0);
    const nowIso = now.toISOString();
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    const tomorrowIso = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const definitionCreate = await req(
      port,
      "POST",
      "/api/lifeops/definitions",
      {
        kind: "routine",
        title: "Current slot check-in",
        timezone: "UTC",
        cadence: {
          kind: "times_per_day",
          slots: [
            {
              key: "current",
              label: "Current",
              minuteOfDay,
              durationMinutes: 20,
            },
          ],
        },
      },
    );
    expect(definitionCreate.status).toBe(201);

    const workflowCreate = await req(port, "POST", "/api/lifeops/workflows", {
      title: "Scheduled follow-up",
      triggerType: "schedule",
      schedule: {
        kind: "once",
        runAt: nowIso,
        timezone: "UTC",
      },
      actionPlan: {
        steps: [
          {
            kind: "create_task",
            request: {
              kind: "task",
              title: "Workflow created task",
              timezone: "UTC",
              cadence: {
                kind: "once",
                dueAt: tomorrowIso,
              },
              ownership: {
                domain: "user_lifeops",
                subjectType: "owner",
              },
            },
          },
        ],
      },
    });
    expect(workflowCreate.status).toBe(201);
    const workflowId = (workflowCreate.data.definition as Record<string, unknown>)
      .id as string;

    const overview = await req(port, "GET", "/api/lifeops/overview");
    expect(overview.status).toBe(200);
    const currentOccurrence = (
      overview.data.occurrences as Array<Record<string, unknown>>
    ).find((occurrence) => occurrence.state === "visible");
    expect(currentOccurrence).toBeDefined();

    const schedulerTask = (
      await runtimeFixture.runtime.getTasks({})
    ).find((task) => task.name === LIFEOPS_TASK_NAME);
    expect(schedulerTask).toBeDefined();

    const worker = runtimeFixture.runtime.getTaskWorker(LIFEOPS_TASK_NAME) as {
      execute: (
        runtime: AgentRuntime,
        options: Record<string, unknown>,
        task: Task,
      ) => Promise<unknown>;
    };
    expect(worker).toBeDefined();

    await worker.execute(runtimeFixture.runtime, { now: nowIso }, schedulerTask!);

    const reminderInspection = await req(
      port,
      "GET",
      `/api/lifeops/reminders/inspection?ownerType=occurrence&ownerId=${encodeURIComponent(currentOccurrence!.id as string)}`,
    );
    expect(reminderInspection.status).toBe(200);
    expect(reminderInspection.data.attempts).toHaveLength(1);
    expect(
      (reminderInspection.data.attempts[0] as Record<string, unknown>).outcome,
    ).toBe("delivered");
    expect(
      (reminderInspection.data.attempts[0] as Record<string, unknown>).channel,
    ).toBe("in_app");

    const workflowRead = await req(
      port,
      "GET",
      `/api/lifeops/workflows/${encodeURIComponent(workflowId)}`,
    );
    expect(workflowRead.status).toBe(200);
    expect(workflowRead.data.runs).toHaveLength(1);
    expect(
      (workflowRead.data.runs[0] as Record<string, unknown>).status,
    ).toBe("success");
    expect(
      (
        (workflowRead.data.definition as Record<string, unknown>)
          .metadata as Record<string, unknown>
      ).lifeopsScheduler,
    ).toMatchObject({
      nextDueAt: null,
      lastRunStatus: "success",
    });

    const definitions = await req(port, "GET", "/api/lifeops/definitions");
    expect(definitions.status).toBe(200);
    expect(
      (
        definitions.data.definitions as Array<Record<string, unknown>>
      ).some(
        (entry) =>
          (entry.definition as Record<string, unknown>).title ===
          "Workflow created task",
      ),
    ).toBe(true);

    const reminderEvents = runtimeFixture.agentEvents.events.filter((event) => {
      const data = event.data as Record<string, unknown> | undefined;
      return (
        event.stream === "assistant" && data?.source === "lifeops-reminder"
      );
    });
    const workflowEvents = runtimeFixture.agentEvents.events.filter((event) => {
      const data = event.data as Record<string, unknown> | undefined;
      return event.stream === "assistant" && data?.source === "lifeops-workflow";
    });
    expect(reminderEvents).toHaveLength(1);
    expect(workflowEvents).toHaveLength(1);
  });
});
