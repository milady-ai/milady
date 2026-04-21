import crypto from "node:crypto";
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
import { DatabaseSync } from "../src/test-utils/sqlite-compat";

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

function createRuntimeForLifeOpsEarnedAccessTests(): AgentRuntime {
  const sqlite = new DatabaseSync(":memory:");
  let tasks: Task[] = [];
  const runtimeSubset = {
    agentId: "lifeops-earned-access-agent",
    character: { name: "LifeOpsEarnedAccessAgent" } as AgentRuntime["character"],
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

let tempDir = "";
let hostsFilePath = "";
let closeServer: (() => Promise<void>) | undefined;

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

async function createServer() {
  tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-lifeops-earned-access-"),
  );
  hostsFilePath = path.join(tempDir, "hosts");
  await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
  setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

  const server = await startApiServer({
    port: 0,
    runtime: createRuntimeForLifeOpsEarnedAccessTests(),
  });
  closeServer = server.close;
  return server;
}

function currentUtcMinuteOfDay(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

async function createVisibleEarnedAccessDefinition(port: number, args: {
  unlockMode: "fixed_duration" | "until_callback";
  unlockDurationMinutes?: number;
  callbackKey?: string;
}) {
  const definitionCreate = await req(port, "POST", "/api/lifeops/definitions", {
    kind: "habit",
    title: "Brush teeth",
    timezone: "UTC",
    cadence: {
      kind: "times_per_day",
      slots: [
        {
          key: "current",
          label: "Current",
          minuteOfDay: currentUtcMinuteOfDay(),
          durationMinutes: 30,
        },
      ],
    },
    websiteAccess: {
      groupKey: "social-media",
      websites: ["x.com", "twitter.com"],
      unlockMode: args.unlockMode,
      unlockDurationMinutes: args.unlockDurationMinutes,
      callbackKey: args.callbackKey,
      reason: "Earn social media access after brushing your teeth.",
    },
  });
  expect(definitionCreate.status).toBe(201);
  return definitionCreate;
}

async function readWebsiteBlockStatus(port: number) {
  const response = await req(port, "GET", "/api/website-blocker");
  expect(response.status).toBe(200);
  return response.data as Record<string, unknown>;
}

describe("LifeOps earned access E2E", () => {
  it("unlocks a fixed-duration earned-access group on completion and relocks it through the API", async () => {
    const server = await createServer();

    await createVisibleEarnedAccessDefinition(server.port, {
      unlockMode: "fixed_duration",
      unlockDurationMinutes: 45,
    });

    const initiallyBlocked = await readWebsiteBlockStatus(server.port);
    expect(initiallyBlocked).toMatchObject({
      active: true,
      websites: ["twitter.com", "x.com"],
      managedBy: "lifeops",
    });
    expect(await fs.readFile(hostsFilePath, "utf8")).toContain("0.0.0.0 x.com");

    const overview = await req(server.port, "GET", "/api/lifeops/overview");
    expect(overview.status).toBe(200);
    const occurrence = (
      overview.data.occurrences as Array<Record<string, unknown>>
    ).find((candidate) => candidate.title === "Brush teeth");
    expect(occurrence).toBeDefined();

    const complete = await req(
      server.port,
      "POST",
      `/api/lifeops/occurrences/${encodeURIComponent(String(occurrence?.id ?? ""))}/complete`,
      {},
    );
    expect(complete.status).toBe(200);
    expect((complete.data.occurrence as Record<string, unknown>).state).toBe(
      "completed",
    );

    const unlockedStatus = await readWebsiteBlockStatus(server.port);
    expect(unlockedStatus).toMatchObject({
      active: false,
      websites: [],
    });
    expect(await fs.readFile(hostsFilePath, "utf8")).toBe(
      "127.0.0.1 localhost\n",
    );

    const relock = await req(
      server.port,
      "POST",
      "/api/lifeops/website-access/relock",
      {
        groupKey: "social-media",
      },
    );
    expect(relock.status).toBe(200);
    expect(relock.data).toMatchObject({ ok: true });

    const relockedStatus = await readWebsiteBlockStatus(server.port);
    expect(relockedStatus).toMatchObject({
      active: true,
      websites: ["twitter.com", "x.com"],
      managedBy: "lifeops",
    });
  });

  it("lets a workflow resolve callback-gated earned access and reapply the LifeOps block", async () => {
    const server = await createServer();

    await createVisibleEarnedAccessDefinition(server.port, {
      unlockMode: "until_callback",
      callbackKey: "after-workout",
    });

    const overview = await req(server.port, "GET", "/api/lifeops/overview");
    expect(overview.status).toBe(200);
    const occurrence = (
      overview.data.occurrences as Array<Record<string, unknown>>
    ).find((candidate) => candidate.title === "Brush teeth");
    expect(occurrence).toBeDefined();

    const complete = await req(
      server.port,
      "POST",
      `/api/lifeops/occurrences/${encodeURIComponent(String(occurrence?.id ?? ""))}/complete`,
      {},
    );
    expect(complete.status).toBe(200);

    const unlockedStatus = await readWebsiteBlockStatus(server.port);
    expect(unlockedStatus).toMatchObject({
      active: false,
      websites: [],
    });

    const workflowCreate = await req(
      server.port,
      "POST",
      "/api/lifeops/workflows",
      {
        title: "Relock after callback",
        triggerType: "manual",
        schedule: {
          kind: "manual",
        },
        actionPlan: {
          steps: [
            {
              kind: "resolve_website_access_callback",
              resultKey: "callback",
              request: {
                callbackKey: "after-workout",
              },
            },
          ],
        },
      },
    );
    expect(workflowCreate.status).toBe(201);
    const workflowId = String(
      (workflowCreate.data.definition as Record<string, unknown>).id,
    );

    const run = await req(
      server.port,
      "POST",
      `/api/lifeops/workflows/${encodeURIComponent(workflowId)}/run`,
      {},
    );
    expect(run.status).toBe(201);
    expect(run.data.run).toMatchObject({
      status: "success",
      result: {
        outputs: {
          callback: {
            ok: true,
          },
        },
      },
    });

    const relockedStatus = await readWebsiteBlockStatus(server.port);
    expect(relockedStatus).toMatchObject({
      active: true,
      websites: ["twitter.com", "x.com"],
      managedBy: "lifeops",
    });
    expect(await fs.readFile(hostsFilePath, "utf8")).toContain(
      "0.0.0.0 twitter.com",
    );
  });

  it("resolves callback-gated earned access through the direct callback route", async () => {
    const server = await createServer();

    await createVisibleEarnedAccessDefinition(server.port, {
      unlockMode: "until_callback",
      callbackKey: "after workout",
    });

    const overview = await req(server.port, "GET", "/api/lifeops/overview");
    expect(overview.status).toBe(200);
    const occurrence = (
      overview.data.occurrences as Array<Record<string, unknown>>
    ).find((candidate) => candidate.title === "Brush teeth");
    expect(occurrence).toBeDefined();

    const complete = await req(
      server.port,
      "POST",
      `/api/lifeops/occurrences/${encodeURIComponent(String(occurrence?.id ?? ""))}/complete`,
      {},
    );
    expect(complete.status).toBe(200);

    const unlockedStatus = await readWebsiteBlockStatus(server.port);
    expect(unlockedStatus).toMatchObject({
      active: false,
      websites: [],
    });

    const resolve = await req(
      server.port,
      "POST",
      "/api/lifeops/website-access/callbacks/after%20workout/resolve",
      {},
    );
    expect(resolve.status).toBe(200);
    expect(resolve.data).toMatchObject({ ok: true });

    const relockedStatus = await readWebsiteBlockStatus(server.port);
    expect(relockedStatus).toMatchObject({
      active: true,
      websites: ["twitter.com", "x.com"],
      managedBy: "lifeops",
    });
    expect(await fs.readFile(hostsFilePath, "utf8")).toContain(
      "0.0.0.0 x.com",
    );
  });
});
