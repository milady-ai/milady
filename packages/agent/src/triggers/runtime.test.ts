import { stringToUuid, type IAgentRuntime, type Task } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIGGER_SCHEMA_VERSION } from "./types";
import {
  executeTriggerTask,
  listTriggerTasks,
  registerTriggerTaskWorker,
  taskToTriggerSummary,
  type TriggerExecutionResult,
} from "./runtime";

function createTriggerTask(overrides?: {
  triggerType?: "once" | "interval";
  maxRuns?: number;
}): Task {
  return {
    id: stringToUuid("task:test"),
    description: "Test trigger",
    metadata: {
      trigger: {
        version: TRIGGER_SCHEMA_VERSION,
        triggerId: stringToUuid("trigger:test"),
        displayName: "Test Trigger",
        instructions: "Do the thing",
        triggerType: overrides?.triggerType ?? "once",
        enabled: true,
        wakeMode: "inject_now",
        createdBy: "test",
        maxRuns: overrides?.maxRuns,
        runCount: 0,
      },
      triggerRuns: [],
    },
  } as Task;
}

function createRuntimeMock() {
  const callOrder: string[] = [];
  const runtime = {
    agentId: stringToUuid("agent:test"),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    getService: vi.fn(() => ({
      getAutonomousRoomId: () => stringToUuid("room:test"),
    })),
    createMemory: vi.fn(async () => {
      callOrder.push("createMemory");
    }),
    updateTask: vi.fn(async () => {
      callOrder.push("updateTask");
    }),
    deleteTask: vi.fn(async () => {
      callOrder.push("deleteTask");
    }),
    registerTaskWorker: vi.fn(),
    getTaskWorker: vi.fn(() => null),
  } as unknown as IAgentRuntime;

  return { runtime, callOrder };
}

describe("trigger runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists once-trigger run history before deleting the task", async () => {
    const task = createTriggerTask({ triggerType: "once" });
    const { runtime, callOrder } = createRuntimeMock();

    const result = await executeTriggerTask(runtime, task, {
      source: "manual",
      force: true,
    });

    expect(result.status).toBe("success");
    expect(result.taskDeleted).toBe(true);
    expect(result.runRecord?.status).toBe("success");
    expect(result.trigger?.runCount).toBe(1);
    expect(callOrder).toEqual(["createMemory", "updateTask", "deleteTask"]);

    const updatePayload = vi.mocked(runtime.updateTask).mock.calls[0]?.[1] as {
      metadata: { triggerRuns?: Array<{ status: string }> };
    };
    expect(updatePayload.metadata.triggerRuns).toHaveLength(1);
    expect(updatePayload.metadata.triggerRuns?.[0]?.status).toBe("success");
  });

  it("returns trigger execution results from the worker for self-deleting triggers", async () => {
    const { runtime } = createRuntimeMock();
    let worker:
      | {
          execute: (
            runtime: IAgentRuntime,
            options: { source?: string; force?: boolean },
            task: Task,
          ) => Promise<TriggerExecutionResult>;
        }
      | undefined;

    vi.mocked(runtime.registerTaskWorker).mockImplementation((definition) => {
      worker = definition as unknown as typeof worker;
    });

    registerTriggerTaskWorker(runtime);
    expect(worker).toBeDefined();

    const result = await worker!.execute(
      runtime,
      { source: "manual", force: true },
      createTriggerTask({ triggerType: "once" }),
    );

    expect(result.taskDeleted).toBe(true);
    expect(result.runRecord?.status).toBe("success");
    expect(result.trigger?.displayName).toBe("Test Trigger");
  });

  it("lists only user triggers and explicit heartbeat tasks", async () => {
    const triggerTask = createTriggerTask({ triggerType: "interval" });
    const heartbeatTask = {
      id: stringToUuid("task:heartbeat"),
      name: "HEARTBEAT",
      description: "Periodic agent heartbeat",
      tags: ["heartbeat", "queue", "repeat"],
      metadata: {
        updateInterval: 30 * 60 * 1000,
        updatedAt: Date.now(),
      },
    } as Task;
    const runtime = {
      agentId: stringToUuid("agent:test"),
      getSetting: vi.fn(() => undefined),
      getTasks: vi.fn(async ({ tags }: { tags?: string[] }) => {
        if (tags?.includes("trigger")) return [triggerTask];
        if (tags?.includes("heartbeat")) return [heartbeatTask];
        return [];
      }),
    } as unknown as IAgentRuntime;

    const tasks = await listTriggerTasks(runtime);

    expect(tasks).toEqual([triggerTask, heartbeatTask]);
  });

  it("does not synthesize internal repeat workers as visible heartbeats", () => {
    const internalTask = {
      id: stringToUuid("task:embedding"),
      name: "EMBEDDING_DRAIN",
      description: "Internal queue drain",
      tags: ["queue", "repeat"],
      metadata: {
        updateInterval: 1000,
        updatedAt: Date.now(),
      },
    } as Task;

    expect(taskToTriggerSummary(internalTask)).toBeNull();
  });
});
