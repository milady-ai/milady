import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcessScheduledWork } = vi.hoisted(() => ({
  mockProcessScheduledWork: vi.fn(),
}));

vi.mock("./service.js", () => ({
  LifeOpsService: class {
    processScheduledWork = mockProcessScheduledWork;
  },
}));

vi.mock("./twilio.js", () => ({
  readTwilioCredentialsFromEnv: () => null,
}));

import {
  ensureLifeOpsSchedulerTask,
  executeLifeOpsSchedulerTask,
  LIFEOPS_TASK_INTERVAL_MS,
  LIFEOPS_TASK_NAME,
  LIFEOPS_TASK_TAGS,
  registerLifeOpsTaskWorker,
} from "./runtime.js";

function createRuntimeMock(tasks: Task[] = []) {
  const workerRegistry = new Map<string, unknown>();
  const state = {
    tasks: [...tasks],
  };
  const runtime = {
    agentId: "agent-lifeops" as UUID,
    getService: vi.fn(() => ({
      getAutonomousRoomId: () => "room-lifeops" as UUID,
    })),
    getTasks: vi.fn(async () => [...state.tasks]),
    createTask: vi.fn(async (task: Task) => {
      const id = (task.id ?? "lifeops-task-id") as UUID;
      state.tasks.push({ ...task, id });
      return id;
    }),
    updateTask: vi.fn(async (taskId: UUID, update: Partial<Task>) => {
      state.tasks = state.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...update,
              metadata: {
                ...(task.metadata ?? {}),
                ...(update.metadata ?? {}),
              } as Task["metadata"],
            }
          : task,
      );
    }),
    registerTaskWorker: vi.fn((worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    }),
    getTaskWorker: vi.fn((name: string) => workerRegistry.get(name)),
  } as unknown as IAgentRuntime;

  return {
    runtime,
    workerRegistry,
    state,
  };
}

describe("lifeops runtime scheduler", () => {
  beforeEach(() => {
    mockProcessScheduledWork.mockReset().mockResolvedValue({
      now: new Date().toISOString(),
      reminderAttempts: [],
      workflowRuns: [],
    });
  });

  it("creates the persistent scheduler task when missing", async () => {
    const { runtime, state } = createRuntimeMock();

    const taskId = await ensureLifeOpsSchedulerTask(runtime);

    expect(taskId).toBe("lifeops-task-id");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.name).toBe(LIFEOPS_TASK_NAME);
    expect(state.tasks[0]?.tags).toEqual([...LIFEOPS_TASK_TAGS]);
    expect(state.tasks[0]?.metadata).toMatchObject({
      updateInterval: LIFEOPS_TASK_INTERVAL_MS,
      baseInterval: LIFEOPS_TASK_INTERVAL_MS,
      blocking: true,
      lifeopsScheduler: {
        kind: "runtime_runner",
        version: 1,
      },
    });
  });

  it("reuses and refreshes the existing scheduler task", async () => {
    const existingTask: Task = {
      id: "existing-lifeops-task" as UUID,
      name: LIFEOPS_TASK_NAME,
      description: "old",
      tags: [...LIFEOPS_TASK_TAGS],
      metadata: {
        lifeopsScheduler: {
          kind: "runtime_runner",
          version: 1,
        },
      },
    };
    const { runtime } = createRuntimeMock([existingTask]);

    const taskId = await ensureLifeOpsSchedulerTask(runtime);

    expect(taskId).toBe(existingTask.id);
    expect(vi.mocked(runtime.updateTask)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.createTask)).not.toHaveBeenCalled();
  });

  it("registers a worker that executes scheduled work", async () => {
    const { runtime, workerRegistry } = createRuntimeMock();

    registerLifeOpsTaskWorker(runtime);
    const worker = workerRegistry.get(LIFEOPS_TASK_NAME) as {
      execute: (
        runtime: IAgentRuntime,
        options: Record<string, unknown>,
        task: Task,
      ) => Promise<{ nextInterval: number }>;
    };

    expect(worker).toBeDefined();
    const result = await worker.execute(
      runtime,
      { now: "2026-04-04T12:00:00.000Z" },
      {
        id: "task-1" as UUID,
        name: LIFEOPS_TASK_NAME,
        tags: [...LIFEOPS_TASK_TAGS],
      },
    );

    expect(mockProcessScheduledWork).toHaveBeenCalledWith({
      now: "2026-04-04T12:00:00.000Z",
    });
    expect(result.nextInterval).toBe(LIFEOPS_TASK_INTERVAL_MS);
  });

  it("supports direct scheduler execution", async () => {
    const { runtime } = createRuntimeMock();

    const result = await executeLifeOpsSchedulerTask(runtime, {
      now: "2026-04-04T13:00:00.000Z",
    });

    expect(mockProcessScheduledWork).toHaveBeenCalledWith({
      now: "2026-04-04T13:00:00.000Z",
    });
    expect(result).toEqual({ nextInterval: LIFEOPS_TASK_INTERVAL_MS });
  });

  describe("waitForDbReady (via ensureLifeOpsSchedulerTask)", () => {
    it("proceeds immediately when DB is healthy", async () => {
      const { runtime } = createRuntimeMock();
      const getTasksSpy = vi.mocked(runtime.getTasks);

      await ensureLifeOpsSchedulerTask(runtime);

      // First call is the probe, second is the real getTasks for lifeops tags
      expect(getTasksSpy).toHaveBeenCalledTimes(2);
      // Probe call uses the sentinel tag
      expect(getTasksSpy.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ tags: ["__db_ready_probe__"] }),
      );
    });

    it("retries the DB probe on transient failure then succeeds", async () => {
      const { runtime } = createRuntimeMock();
      const getTasksSpy = vi.mocked(runtime.getTasks);

      // First probe call fails, second succeeds
      let probeCallCount = 0;
      getTasksSpy.mockImplementation(async (params) => {
        const tags = (params as { tags?: string[] }).tags;
        if (tags?.includes("__db_ready_probe__")) {
          probeCallCount++;
          if (probeCallCount === 1) {
            throw new Error("PGlite not ready");
          }
          return [];
        }
        return [];
      });

      const taskId = await ensureLifeOpsSchedulerTask(runtime);

      // Should have retried the probe then proceeded to create
      expect(probeCallCount).toBe(2);
      expect(taskId).toBeDefined();
    });

    it("continues to create the task even when all probe attempts fail", async () => {
      const { runtime, state } = createRuntimeMock();
      const getTasksSpy = vi.mocked(runtime.getTasks);

      // All probe calls fail, but real calls work
      getTasksSpy.mockImplementation(async (params) => {
        const tags = (params as { tags?: string[] }).tags;
        if (tags?.includes("__db_ready_probe__")) {
          throw new Error("PGlite never ready");
        }
        return [...state.tasks];
      });

      const taskId = await ensureLifeOpsSchedulerTask(runtime);

      // Should still succeed by falling through to the actual task creation
      expect(taskId).toBe("lifeops-task-id");
      expect(state.tasks).toHaveLength(1);
    });
  });
});
