import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SELFCONTROL_ACCESS_ERROR } from "./access";

const roleMocks = vi.hoisted(() => ({
  checkSenderRole: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: roleMocks.checkSenderRole,
}));

import {
  blockWebsitesAction,
  getWebsiteBlockStatusAction,
  requestWebsiteBlockingPermissionAction,
  unblockWebsitesAction,
} from "./action";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "./selfcontrol";

let tempDir = "";
let hostsFilePath = "";

function createRuntimeMock(
  overrides: Partial<IAgentRuntime> = {},
): IAgentRuntime & { __tasks: Task[] } {
  const workerRegistry = new Map<string, unknown>();
  let nextTaskId = 0;
  const state = {
    tasks: [] as Task[],
  };

  return {
    agentId: "agent-selfcontrol" as UUID,
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
    __tasks: state.tasks,
    ...overrides,
  } as IAgentRuntime & { __tasks: Task[] };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
  roleMocks.checkSenderRole.mockReset().mockResolvedValue({
    entityId: "user-1",
    role: "ADMIN",
    isOwner: false,
    isAdmin: true,
    canManageRoles: true,
  });
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  vi.restoreAllMocks();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("blockWebsitesAction", () => {
  it("uses explicit action parameters when they are provided", async () => {
    const runtime = createRuntimeMock();
    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "do it" },
      } as never,
      undefined,
      {
        parameters: {
          websites: ["https://x.com", "twitter.com"],
          durationMinutes: "180",
        },
      } as never,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a website block/i);
    expect(result.data).toMatchObject({
      websites: ["x.com", "twitter.com"],
      durationMinutes: 180,
    });

    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  it("extracts websites from recent conversation context without the model path", async () => {
    const getMemories = vi.fn().mockResolvedValue([
      {
        entityId: "user-1",
        content: {
          text: "Please block x.com and twitter.com for 30 minutes.",
        },
        createdAt: 1,
      },
    ]);

    const runtime = createRuntimeMock({
      getMemories,
    } as Partial<IAgentRuntime>);
    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "do it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a website block/i);
    expect(getMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        count: 16,
      }),
    );

    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  it("fails with a conversation-aware error when the action has no parameters and no websites can be derived from recent messages", async () => {
    const runtime = createRuntimeMock({
      getMemories: vi.fn().mockResolvedValue([]),
    } as Partial<IAgentRuntime>);
    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "nah use self control, block the website plz" },
      } as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: false,
      text: "Could not determine which public website hostnames to block from the recent conversation. Name the sites explicitly, or pass them to the action as parameters.",
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });

  it("falls back to assistant-restated websites when the recent sender turn is shorthand", async () => {
    const getMemories = vi.fn().mockResolvedValue([
      {
        entityId: "assistant-1",
        content: {
          text: "I can block x.com and twitter.com for an hour whenever you want.",
        },
        createdAt: 1,
      },
    ]);

    const runtime = createRuntimeMock({
      getMemories,
    } as Partial<IAgentRuntime>);
    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "do it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toMatch(/Started a website block/i);
    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  it("refuses to start a second block while another one is active", async () => {
    const runtime = createRuntimeMock();
    await blockWebsitesAction.handler(
      runtime,
      {
        content: { text: "Block x.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("already running");
  });

  it("rejects non-admin users", async () => {
    roleMocks.checkSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const validate = await blockWebsitesAction.validate?.(createRuntimeMock(), {
      entityId: "user-1",
      roomId: "room-1",
      content: { text: "block x.com" },
    } as never);
    expect(validate).toBe(false);

    const runtime = createRuntimeMock();
    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "block x.com" },
      } as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: false,
      text: SELFCONTROL_ACCESS_ERROR,
    });
  });

  it("does not block when the current message explicitly says not to block yet", async () => {
    const runtime = createRuntimeMock();
    const validate = await blockWebsitesAction.validate?.(runtime, {
      entityId: "user-1",
      roomId: "room-1",
      content: {
        text: "The websites distracting me are x.com and twitter.com. Do not block them yet.",
      },
    } as never);

    expect(validate).toBe(false);

    const result = await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: {
          text: "The websites distracting me are x.com and twitter.com. Do not block them yet.",
        },
      } as never,
      undefined,
      undefined,
    );

    expect(result).toMatchObject({
      success: true,
      text: "I noted those websites and will wait for your confirmation before blocking them.",
      data: {
        deferred: true,
      },
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});

describe("getWebsiteBlockStatusAction", () => {
  it("reports the active block details", async () => {
    const runtime = createRuntimeMock();
    await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block x.com and twitter.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await getWebsiteBlockStatusAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "status?" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("website block is active");
    expect(result.data).toMatchObject({
      active: true,
      engine: "hosts-file",
      requiresElevation: false,
      websites: ["x.com", "twitter.com"],
    });
  });
});

describe("requestWebsiteBlockingPermissionAction", () => {
  it("reports the website blocking permission state for admin users", async () => {
    const runtime = createRuntimeMock();
    const result = await requestWebsiteBlockingPermissionAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "give yourself permission to block websites" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("system hosts file directly");
    expect(result.data).toMatchObject({
      status: "granted",
      canRequest: false,
      hostsFilePath,
      promptAttempted: false,
      promptSucceeded: false,
    });
  });
});

describe("unblockWebsitesAction", () => {
  it("removes an active website block early", async () => {
    const runtime = createRuntimeMock();
    await blockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "Block x.com for 30 minutes." },
      } as never,
      undefined,
      undefined,
    );

    const result = await unblockWebsitesAction.handler(
      runtime,
      {
        entityId: "user-1",
        roomId: "room-1",
        content: { text: "remove it" },
      } as never,
      undefined,
      undefined,
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain("Removed the website block");
    expect(result.data).toMatchObject({
      active: false,
      canUnblockEarly: true,
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});
