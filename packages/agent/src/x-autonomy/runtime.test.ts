import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as xPoster from "../lifeops/x-poster.js";

import {
  createXDraftSuggestions,
  ensureXAutonomyTask,
  executeXAutonomyTask,
  registerXAutonomyTaskWorker,
  startXAutonomyRuntimeLoop,
  X_AUTONOMY_TASK_INTERVAL_MS,
  X_AUTONOMY_TASK_NAME,
  X_AUTONOMY_TASK_TAGS,
  type XAutonomyQueueItem,
} from "./runtime.js";

const ORIGINAL_ENV = { ...process.env };
const NOW = new Date("2026-05-02T12:00:00.000Z");

function createRuntimeMock(tasks: Task[] = []) {
  const workerRegistry = new Map<string, unknown>();
  const state = { tasks: [...tasks] };
  const runtime = {
    agentId: "agent-x" as UUID,
    getService: vi.fn(() => ({
      getAutonomousRoomId: () => "room-x" as UUID,
    })),
    getTasks: vi.fn(async () => [...state.tasks]),
    createTask: vi.fn(async (task: Task) => {
      const id = (task.id ?? "x-task-id") as UUID;
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
    useModel: vi.fn(async () =>
      JSON.stringify([
        "shipping the agent loop with receipts instead of vibes",
        "agent status: alive. deployment logs: emotionally complicated.",
      ]),
    ),
  } as unknown as IAgentRuntime;

  return { runtime, state, workerRegistry };
}

function makeExistingTask(
  queue: XAutonomyQueueItem[] = [],
  extraMetadata: Record<string, unknown> = {},
): Task {
  return {
    id: "existing-x-task" as UUID,
    name: X_AUTONOMY_TASK_NAME,
    description: "Autonomous X drafts and optional posting for botdick",
    tags: [...X_AUTONOMY_TASK_TAGS],
    metadata: {
      xAutonomy: { kind: "runtime_runner", version: 1 },
      xQueue: queue,
      ...extraMetadata,
    },
  };
}

describe("x autonomy runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.BOTDICK_HOMEPAGE_MIRROR = "false";
    process.env.BOTDICK_X_SEND_SUGGESTIONS = "false";
    delete process.env.BOTDICK_X_AUTO_PUBLISH;
    delete process.env.BOTDICK_X_AUTONOMY_ENABLED;
    delete process.env.BOTDICK_X_DRAFT_INTERVAL_MS;
    vi.spyOn(xPoster, "postToX").mockResolvedValue({
      ok: true,
      status: 201,
      postId: "123",
      category: "success",
    });
    vi.spyOn(xPoster, "readXPosterCredentialsFromEnv").mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it("creates the persistent X autonomy task when missing", async () => {
    const { runtime, state } = createRuntimeMock();

    const taskId = await ensureXAutonomyTask(runtime);

    expect(taskId).toBe("x-task-id");
    expect(state.tasks[0]?.name).toBe(X_AUTONOMY_TASK_NAME);
    expect(state.tasks[0]?.tags).toEqual([...X_AUTONOMY_TASK_TAGS]);
    expect(state.tasks[0]?.metadata).toMatchObject({
      updateInterval: X_AUTONOMY_TASK_INTERVAL_MS,
      blocking: true,
      xAutonomy: { kind: "runtime_runner", version: 1 },
      xQueue: [],
    });
  });

  it("registers the worker once", () => {
    const { runtime, workerRegistry } = createRuntimeMock();

    registerXAutonomyTaskWorker(runtime);
    registerXAutonomyTaskWorker(runtime);

    expect(workerRegistry.has(X_AUTONOMY_TASK_NAME)).toBe(true);
    expect(runtime.registerTaskWorker).toHaveBeenCalledTimes(1);
  });

  it("arms one runtime loop that runs independently of the task scheduler", async () => {
    vi.useFakeTimers();
    const { runtime, state } = createRuntimeMock();

    startXAutonomyRuntimeLoop(runtime);
    startXAutonomyRuntimeLoop(runtime);

    expect(vi.getTimerCount()).toBe(2);

    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.tasks[0]?.name).toBe(X_AUTONOMY_TASK_NAME);
    expect(runtime.useModel).toHaveBeenCalledTimes(1);
  });

  it("drafts a queued X post without publishing by default", async () => {
    const { runtime, state } = createRuntimeMock([makeExistingTask()]);

    const result = await executeXAutonomyTask(runtime);

    expect(result.nextInterval).toBe(X_AUTONOMY_TASK_INTERVAL_MS);
    expect(runtime.useModel).toHaveBeenCalledTimes(1);
    expect(xPoster.postToX).not.toHaveBeenCalled();

    const queue = state.tasks[0]?.metadata?.xQueue as XAutonomyQueueItem[];
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      text: "shipping the agent loop with receipts instead of vibes",
      status: "drafted",
      source: "x-autonomy",
      attempts: 0,
    });
  });

  it("drafts immediately on request and persists the queue", async () => {
    const { runtime, state } = createRuntimeMock([makeExistingTask()]);

    const result = await createXDraftSuggestions(runtime, {
      count: 2,
      source: "x-autonomy-discord-action",
      sendSuggestions: false,
      now: NOW,
    });

    expect(result.items).toHaveLength(2);
    expect(result.taskId).toBe("existing-x-task");
    const queue = state.tasks[0]?.metadata?.xQueue as XAutonomyQueueItem[];
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      text: "shipping the agent loop with receipts instead of vibes",
      source: "x-autonomy-discord-action",
      status: "drafted",
    });
  });

  it("auto-publishes a draft when enabled and X credentials are configured", async () => {
    process.env.BOTDICK_X_AUTO_PUBLISH = "true";
    (
      xPoster.readXPosterCredentialsFromEnv as unknown as ReturnType<
        typeof vi.fn
      >
    ).mockReturnValue({
      apiKey: "key",
      apiSecretKey: "secret",
      accessToken: "token",
      accessTokenSecret: "token-secret",
    });
    const draft: XAutonomyQueueItem = {
      id: "draft-1",
      text: "queued text",
      status: "drafted",
      source: "x-autonomy",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      attempts: 0,
    };
    const { runtime, state } = createRuntimeMock([
      makeExistingTask([draft], {
        xAutonomy: {
          kind: "runtime_runner",
          version: 1,
          lastDraftedAt: new Date().toISOString(),
        },
      }),
    ]);

    await executeXAutonomyTask(runtime);

    expect(xPoster.postToX).toHaveBeenCalledWith(
      expect.objectContaining({ text: "queued text" }),
    );
    const queue = state.tasks[0]?.metadata?.xQueue as XAutonomyQueueItem[];
    expect(queue[0]).toMatchObject({
      status: "posted",
      attempts: 1,
      url: "https://x.com/i/web/status/123",
    });
  });

  it("keeps a draft queued when auto-publish is enabled but credentials are missing", async () => {
    process.env.BOTDICK_X_AUTO_PUBLISH = "true";
    const draft: XAutonomyQueueItem = {
      id: "draft-1",
      text: "queued text",
      status: "drafted",
      source: "x-autonomy",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      attempts: 0,
    };
    const { runtime, state } = createRuntimeMock([
      makeExistingTask([draft], {
        xAutonomy: {
          kind: "runtime_runner",
          version: 1,
          lastDraftedAt: new Date().toISOString(),
        },
      }),
    ]);

    await executeXAutonomyTask(runtime);

    expect(xPoster.postToX).not.toHaveBeenCalled();
    const queue = state.tasks[0]?.metadata?.xQueue as XAutonomyQueueItem[];
    expect(queue[0]).toMatchObject({
      status: "drafted",
      attempts: 0,
    });
    expect(queue[0]?.error).toContain("TWITTER_* credentials missing");
  });
});
