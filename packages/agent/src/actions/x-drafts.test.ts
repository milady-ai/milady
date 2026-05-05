import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  X_AUTONOMY_TASK_NAME,
  X_AUTONOMY_TASK_TAGS,
  type XAutonomyQueueItem,
} from "../x-autonomy/runtime.js";
import { draftXPostsAction, isXDraftRequest } from "./x-drafts";

const ORIGINAL_ENV = { ...process.env };

function makeMessage(text: string) {
  return {
    content: { text },
  } as never;
}

function makeStateWithRecent(texts: string[]) {
  return {
    recentMessages: texts.map((text) => ({ content: { text } })),
  } as never;
}

function createRuntimeMock(tasks: Task[] = []) {
  const state = { tasks: [...tasks] };
  const runtime = {
    agentId: "agent-1" as UUID,
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
    useModel: vi.fn(async (model: unknown) => {
      expect(model).toBe(ModelType.TEXT_SMALL);
      return JSON.stringify(["first draft", "second draft"]);
    }),
  } as unknown as IAgentRuntime;

  return { runtime, state };
}

function makeExistingTask(): Task {
  return {
    id: "existing-x-task" as UUID,
    name: X_AUTONOMY_TASK_NAME,
    description: "Autonomous X drafts and optional posting for botdick",
    tags: [...X_AUTONOMY_TASK_TAGS],
    metadata: {
      xAutonomy: { kind: "runtime_runner", version: 1 },
      xQueue: [],
    },
  };
}

describe("draftXPostsAction", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("recognizes tweet draft and immediate follow-up phrasing", () => {
    expect(isXDraftRequest("write some tweets")).toBe(true);
    expect(isXDraftRequest("can I hear them")).toBe(true);
    expect(isXDraftRequest("tweet ideas")).toBe(true);
    expect(isXDraftRequest("x post ideas")).toBe(true);
    expect(isXDraftRequest("post this to x: hello")).toBe(false);
  });

  it("validates yes/more only when recent context is about X drafts", async () => {
    await expect(
      draftXPostsAction.validate?.(
        {} as never,
        makeMessage("Yes\nhello"),
        makeStateWithRecent([
          "Yep—received. Basic test passed on my side. Want me to generate a few more tweet drafts now?",
        ]),
      ),
    ).resolves.toBe(true);

    await expect(
      draftXPostsAction.validate?.(
        {} as never,
        makeMessage("Any more or"),
        makeStateWithRecent([
          "X drafts:\n1. first\n2. second\n\nReply with the one to post, or tell me what angle to mutate.",
        ]),
      ),
    ).resolves.toBe(true);

    await expect(
      draftXPostsAction.validate?.(
        {} as never,
        makeMessage("yes"),
        makeStateWithRecent(["Want me to restart the service?"]),
      ),
    ).resolves.toBe(false);
  });

  it("queues drafts and returns them in the Discord response", async () => {
    process.env.BOTDICK_HOMEPAGE_MIRROR = "false";
    const { runtime, state } = createRuntimeMock([makeExistingTask()]);

    const result = await draftXPostsAction.handler?.(
      runtime,
      makeMessage("write some tweets"),
      {} as never,
      undefined,
    );

    const queue = state.tasks[0]?.metadata?.xQueue as XAutonomyQueueItem[];
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      text: "first draft",
      source: "x-autonomy-discord-action",
      status: "drafted",
    });
    expect(result).toMatchObject({
      success: true,
      values: { count: 2, queued: true },
    });
    expect(result?.text).toContain("X drafts:");
    expect(result?.text).toContain("1. first draft");
    expect(result?.text).toContain("2. second draft");
  });
});
