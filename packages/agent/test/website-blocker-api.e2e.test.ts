import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import { afterEach, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

let tempDir = "";
let hostsFilePath = "";
let closeServer: (() => Promise<void>) | undefined;

function createRuntimeMock(): AgentRuntime {
  const workerRegistry = new Map<string, unknown>();
  let nextTaskId = 0;
  const tasks: Task[] = [];

  return {
    agentId: "website-blocker-api-agent" as UUID,
    character: {
      name: "Chen",
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    getTask: async (taskId: UUID) =>
      tasks.find((task) => task.id === taskId) ?? null,
    getTasks: async () => [...tasks],
    createTask: async (task: Task) => {
      const id = (task.id ?? `website-blocker-task-${nextTaskId++}`) as UUID;
      tasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      const index = tasks.findIndex((task) => task.id === taskId);
      if (index === -1) {
        return;
      }
      const current = tasks[index] as Task;
      tasks[index] = {
        ...current,
        ...update,
        metadata: {
          ...((current.metadata as Record<string, unknown> | undefined) ?? {}),
          ...((update.metadata as Record<string, unknown> | undefined) ?? {}),
        },
      };
    },
    deleteTask: async (taskId: UUID) => {
      const index = tasks.findIndex((task) => task.id === taskId);
      if (index !== -1) {
        tasks.splice(index, 1);
      }
    },
    registerTaskWorker: (worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    },
    getTaskWorker: (name: string) => workerRegistry.get(name),
    getService: () => null,
    getServicesByType: () => [],
    emitEvent: async () => {},
    registerSendHandler: () => {},
  } as unknown as AgentRuntime;
}

afterEach(async () => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  if (closeServer) {
    await closeServer();
    closeServer = undefined;
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = "";
    hostsFilePath = "";
  }
});

describe("website-blocker API (e2e)", () => {
  it("blocks, reports status, and unblocks websites through the real API server", async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-website-blocker-e2e-"),
    );
    hostsFilePath = path.join(tempDir, "hosts");
    await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
    setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

    const server = await startApiServer({
      port: 0,
      runtime: createRuntimeMock(),
    });
    closeServer = server.close;

    const startResponse = await req(
      server.port,
      "PUT",
      "/api/website-blocker",
      {
        websites: ["x.com", "twitter.com"],
        durationMinutes: 60,
      },
    );
    expect(startResponse.status).toBe(200);
    expect(startResponse.data).toMatchObject({
      success: true,
      request: {
        websites: ["x.com", "twitter.com"],
        durationMinutes: 60,
      },
    });

    const hostsFile = await fs.readFile(hostsFilePath, "utf8");
    expect(hostsFile).toContain("0.0.0.0 x.com");
    expect(hostsFile).toContain("0.0.0.0 twitter.com");

    const statusResponse = await req(
      server.port,
      "GET",
      "/api/website-blocker",
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.data).toMatchObject({
      active: true,
      available: true,
      engine: "hosts-file",
      hostsFilePath,
      requiresElevation: false,
      websites: ["x.com", "twitter.com"],
    });

    const stopResponse = await req(
      server.port,
      "DELETE",
      "/api/website-blocker",
    );
    expect(stopResponse.status).toBe(200);
    expect(stopResponse.data).toMatchObject({
      success: true,
      removed: true,
      status: {
        active: false,
        websites: [],
      },
    });
    expect(await fs.readFile(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );
  });
});
