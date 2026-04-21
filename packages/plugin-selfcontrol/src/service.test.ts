import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSelfControlStatus,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
  startSelfControlBlock,
  stopSelfControlBlock,
} from "./selfcontrol";
import {
  executeWebsiteBlockerExpiryTask,
  registerWebsiteBlockerTaskWorker,
  syncWebsiteBlockerExpiryTask,
  WEBSITE_BLOCKER_UNBLOCK_TASK_NAME,
  WebsiteBlockerService,
} from "./service";

let tempDir = "";
let hostsFilePath = "";

function createRuntimeMock(initialTasks: Task[] = []) {
  const workerRegistry = new Map<string, unknown>();
  let nextTaskId = 0;
  const state = {
    tasks: [...initialTasks],
  };

  const runtime = {
    agentId: "agent-selfcontrol" as UUID,
    serverless: true,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    getTask: vi.fn(async (taskId: UUID) => {
      return state.tasks.find((task) => task.id === taskId) ?? null;
    }),
    getTasks: vi.fn(async () => [...state.tasks]),
    createTask: vi.fn(async (task: Task) => {
      const id = (task.id ?? `website-blocker-task-${nextTaskId++}`) as UUID;
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
                ...((task.metadata as Record<string, unknown> | undefined) ??
                  {}),
                ...((update.metadata as Record<string, unknown> | undefined) ??
                  {}),
              },
            }
          : task,
      );
    }),
    deleteTask: vi.fn(async (taskId: UUID) => {
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
    }),
    registerTaskWorker: vi.fn((worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    }),
    getTaskWorker: vi.fn((name: string) => workerRegistry.get(name)),
  } as unknown as IAgentRuntime;

  return {
    runtime,
    state,
    workerRegistry,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
});

afterEach(() => {
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  vi.useRealTimers();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
    hostsFilePath = "";
  }
});

describe("website blocker task integration", () => {
  it("schedules a one-shot unblock task and clears the block through Eliza task execution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T10:00:00.000Z"));

    const { runtime, state, workerRegistry } = createRuntimeMock();
    registerWebsiteBlockerTaskWorker(runtime);

    await expect(
      startSelfControlBlock({
        websites: ["x.com"],
        durationMinutes: 1,
        scheduledByAgentId: String(runtime.agentId),
      }),
    ).resolves.toMatchObject({
      success: true,
      endsAt: "2026-04-07T10:01:00.000Z",
    });

    const taskId = await syncWebsiteBlockerExpiryTask(runtime);
    expect(taskId).toBeTruthy();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      name: WEBSITE_BLOCKER_UNBLOCK_TASK_NAME,
      dueAt: Date.parse("2026-04-07T10:01:00.000Z"),
    });

    vi.setSystemTime(new Date("2026-04-07T10:01:00.000Z"));
    const taskWorker = workerRegistry.get(WEBSITE_BLOCKER_UNBLOCK_TASK_NAME) as
      | {
          execute: (
            runtime: IAgentRuntime,
            options: unknown,
            task: Task,
          ) => Promise<void>;
        }
      | undefined;
    expect(taskWorker).toBeDefined();
    const dueTask = state.tasks[0];
    expect(dueTask).toBeDefined();
    await taskWorker?.execute(runtime, undefined, dueTask as Task);
    await runtime.deleteTask((dueTask as Task).id as UUID);

    expect(state.tasks).toHaveLength(0);
    expect(await getSelfControlStatus()).toMatchObject({
      active: false,
      websites: [],
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });

  it("rehydrates a timed block into a task when the blocker service starts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));

    const { runtime, state, workerRegistry } = createRuntimeMock();
    await startSelfControlBlock({
      websites: ["x.com", "twitter.com"],
      durationMinutes: 30,
      scheduledByAgentId: String(runtime.agentId),
    });

    await WebsiteBlockerService.start(runtime);

    expect(workerRegistry.has(WEBSITE_BLOCKER_UNBLOCK_TASK_NAME)).toBe(true);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({
      name: WEBSITE_BLOCKER_UNBLOCK_TASK_NAME,
    });
  });

  it("clears the scheduled task when the block is removed early", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T14:00:00.000Z"));

    const { runtime, state } = createRuntimeMock();
    await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 15,
      scheduledByAgentId: String(runtime.agentId),
    });
    await syncWebsiteBlockerExpiryTask(runtime);

    expect(state.tasks).toHaveLength(1);

    await stopSelfControlBlock();
    const status = await getSelfControlStatus();
    await syncWebsiteBlockerExpiryTask(runtime, status);

    expect(state.tasks).toHaveLength(0);
  });

  it("does not let a stale unblock task remove a newer block", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T16:00:00.000Z"));

    const { runtime, state } = createRuntimeMock();
    await startSelfControlBlock({
      websites: ["x.com"],
      durationMinutes: 30,
      scheduledByAgentId: String(runtime.agentId),
    });
    await syncWebsiteBlockerExpiryTask(runtime);
    const staleTask = { ...state.tasks[0] } as Task;

    await stopSelfControlBlock();
    const clearedStatus = await getSelfControlStatus();
    await syncWebsiteBlockerExpiryTask(runtime, clearedStatus);

    vi.setSystemTime(new Date("2026-04-07T16:05:00.000Z"));
    await startSelfControlBlock({
      websites: ["twitter.com"],
      durationMinutes: 60,
      scheduledByAgentId: String(runtime.agentId),
    });

    await executeWebsiteBlockerExpiryTask(runtime, staleTask);

    expect(await getSelfControlStatus()).toMatchObject({
      active: true,
      websites: ["twitter.com"],
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toContain(
      "0.0.0.0 twitter.com",
    );
  });
});
