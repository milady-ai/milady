import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WebsiteBlockerRouteContext } from "../../src/api/website-blocker-routes";
import { handleWebsiteBlockerRoutes } from "../../src/api/website-blocker-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

let tempDir = "";
let hostsFilePath = "";

function createRuntimeMock(): IAgentRuntime {
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
  } as unknown as IAgentRuntime;
}

function buildCtx(
  method: string,
  pathname: string,
  body?: Record<string, unknown>,
  runtime?: IAgentRuntime,
): WebsiteBlockerRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({ method, url: pathname }),
    res,
    method,
    pathname,
    runtime,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => body ?? null),
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-selfcontrol-api-"));
  hostsFilePath = path.join(tempDir, "hosts");
  fs.writeFileSync(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });
});

afterEach(() => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
    hostsFilePath = "";
  }
});

describe("website-blocker-routes", () => {
  test("GET /api/website-blocker returns the blocker status", async () => {
    const ctx = buildCtx("GET", "/api/website-blocker");

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      active: false,
      available: true,
      engine: "hosts-file",
      hostsFilePath,
      requiresElevation: false,
    });
  });

  test("PUT /api/website-blocker starts a block from explicit websites", async () => {
    const runtime = createRuntimeMock();
    const ctx = buildCtx(
      "PUT",
      "/api/website-blocker",
      {
        websites: ["x.com", "twitter.com"],
        durationMinutes: 30,
      },
      runtime,
    );

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const [_, payload, status] = (ctx.json as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      request: {
        websites: ["x.com", "twitter.com"],
        durationMinutes: 30,
      },
    });

    const hostsFile = fs.readFileSync(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");
  });

  test("PUT /api/website-blocker can parse website text without chat state", async () => {
    const ctx = buildCtx("PUT", "/api/website-blocker", {
      text: "Block x.com until I unblock it.",
    });

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      request: {
        websites: ["x.com"],
        durationMinutes: null,
      },
    });
  });

  test("DELETE /api/website-blocker removes an active block", async () => {
    const runtime = createRuntimeMock();
    await handleWebsiteBlockerRoutes(
      buildCtx(
        "PUT",
        "/api/website-blocker",
        {
          websites: ["x.com"],
          durationMinutes: 15,
        },
        runtime,
      ),
    );

    const ctx = buildCtx("DELETE", "/api/website-blocker", undefined, runtime);
    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload).toMatchObject({
      success: true,
      removed: true,
      status: {
        active: false,
        websites: [],
      },
    });
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });

  test("PUT /api/website-blocker rejects timed blocks when no runtime is available", async () => {
    const ctx = buildCtx("PUT", "/api/website-blocker", {
      websites: ["x.com"],
      durationMinutes: 15,
    });

    const handled = await handleWebsiteBlockerRoutes(ctx);

    expect(handled).toBe(true);
    expect(ctx.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Timed website blocks require the Eliza runtime"),
      503,
    );
    expect(fs.readFileSync(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});
