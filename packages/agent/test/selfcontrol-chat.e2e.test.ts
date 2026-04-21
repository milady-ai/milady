import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, Content, Task, UUID } from "@elizaos/core";
import {
  selfControlBlockWebsitesAction,
  selfControlRequestPermissionAction,
} from "@miladyai/plugin-selfcontrol";
import {
  cancelSelfControlExpiryTimer,
  resetSelfControlStatusCache,
  setSelfControlPluginConfig,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConversation,
  postConversationMessage,
  req,
} from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type SseEventPayload = {
  type?: string;
  text?: string;
  fullText?: string;
  agentName?: string;
  message?: string;
};

function reqSse(
  port: number,
  p: string,
  body: Record<string, unknown>,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  events: SseEventPayload[];
}> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const events: SseEventPayload[] = [];
          const blocks = raw
            .split("\n\n")
            .map((block) => block.trim())
            .filter((block) => block.length > 0);

          for (const block of blocks) {
            for (const line of block.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data) continue;
              try {
                events.push(JSON.parse(data) as SseEventPayload);
              } catch {
                // Ignore malformed SSE payloads in this helper.
              }
            }
          }

          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            events,
          });
        });
      },
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function createRuntimeForSelfControlChatTests(options: {
  handleMessage: (
    runtime: AgentRuntime,
    message: object,
    onResponse: (content: Content) => Promise<object[]>,
    messageOptions?: {
      onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
    },
  ) => Promise<{
    responseContent?: {
      text?: string;
      actions?: string[] | string;
    };
    responseMessages?: Array<{ id?: string; content?: Content }>;
    mode?: string;
  }>;
  useModel: AgentRuntime["useModel"];
}): AgentRuntime {
  const memoriesByRoom = new Map<string, Array<Record<string, unknown>>>();
  const roomsById = new Map<string, { id: UUID; worldId: UUID }>();
  const worldsById = new Map<
    string,
    { id: UUID; metadata?: Record<string, unknown> | null }
  >();
  const workerRegistry = new Map<string, unknown>();
  let nextTaskId = 0;
  const scheduledTasks: Task[] = [];

  const runtimeSubset = {
    agentId: "selfcontrol-chat-agent",
    registerSendHandler: () => {},
    character: {
      name: "Chen",
      postExamples: ["Sure."],
    } as AgentRuntime["character"],
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as AgentRuntime["logger"],
    messageService: {
      handleMessage: async (
        runtime: AgentRuntime,
        message: object,
        onResponse: (content: Content) => Promise<object[]>,
        messageOptions?: {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
        },
      ) => options.handleMessage(runtime, message, onResponse, messageOptions),
    } as AgentRuntime["messageService"],
    ensureConnection: async (args: {
      roomId: UUID;
      worldId: UUID;
      metadata?: Record<string, unknown>;
    }) => {
      roomsById.set(String(args.roomId), {
        id: args.roomId,
        worldId: args.worldId,
      });
      const existingWorld = worldsById.get(String(args.worldId));
      if (!existingWorld) {
        worldsById.set(String(args.worldId), {
          id: args.worldId,
          metadata: args.metadata ?? {},
        });
      }
    },
    getRoom: async (roomId: UUID) => roomsById.get(String(roomId)) ?? null,
    getWorld: async (worldId: UUID) => worldsById.get(String(worldId)) ?? null,
    updateWorld: async (world: {
      id: UUID;
      metadata?: Record<string, unknown>;
    }) => {
      worldsById.set(String(world.id), world);
    },
    createMemory: async (memory: Record<string, unknown>) => {
      const roomId = String(memory.roomId ?? "");
      if (!roomId) return;
      const current = memoriesByRoom.get(roomId) ?? [];
      current.push({
        ...memory,
        createdAt:
          typeof memory.createdAt === "number" ? memory.createdAt : Date.now(),
      });
      memoriesByRoom.set(roomId, current);
    },
    getMemories: async (query: { roomId?: string; count?: number }) => {
      const roomId = String(query.roomId ?? "");
      const current = memoriesByRoom.get(roomId) ?? [];
      const count = Math.max(1, query.count ?? current.length);
      return current.slice(-count) as Awaited<
        ReturnType<AgentRuntime["getMemories"]>
      >;
    },
    getMemoriesByRoomIds: async (query: {
      roomIds?: string[];
      limit?: number;
    }) => {
      const roomIds = Array.isArray(query.roomIds) ? query.roomIds : [];
      const merged: Array<Record<string, unknown>> = [];
      for (const roomId of roomIds) {
        merged.push(...(memoriesByRoom.get(String(roomId)) ?? []));
      }
      merged.sort(
        (left, right) =>
          Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0),
      );
      return merged.slice(-(query.limit ?? merged.length)) as Awaited<
        ReturnType<AgentRuntime["getMemoriesByRoomIds"]>
      >;
    },
    getRoomsByWorld: async () => [],
    getTask: async (taskId: UUID) =>
      scheduledTasks.find((task) => task.id === taskId) ?? null,
    getTasks: async () => [...scheduledTasks],
    createTask: async (task: Task) => {
      const id = (task.id ?? `website-blocker-task-${nextTaskId++}`) as UUID;
      scheduledTasks.push({ ...task, id });
      return id;
    },
    updateTask: async (taskId: UUID, update: Partial<Task>) => {
      const index = scheduledTasks.findIndex((task) => task.id === taskId);
      if (index === -1) {
        return;
      }
      const current = scheduledTasks[index] as Task;
      scheduledTasks[index] = {
        ...current,
        ...update,
        metadata: {
          ...((current.metadata as Record<string, unknown> | undefined) ?? {}),
          ...((update.metadata as Record<string, unknown> | undefined) ?? {}),
        },
      };
    },
    deleteTask: async (taskId: UUID) => {
      const index = scheduledTasks.findIndex((task) => task.id === taskId);
      if (index !== -1) {
        scheduledTasks.splice(index, 1);
      }
    },
    registerTaskWorker: (worker: { name: string }) => {
      workerRegistry.set(worker.name, worker);
    },
    getTaskWorker: (name: string) => workerRegistry.get(name),
    emitEvent: async () => {},
    getService: () => null,
    getServicesByType: () => [],
    getCache: async () => null,
    setCache: async () => {},
    useModel: options.useModel,
    actions: [
      selfControlBlockWebsitesAction,
      selfControlRequestPermissionAction,
    ],
  };

  return runtimeSubset as unknown as AgentRuntime;
}

let tempDir = "";
let hostsFilePath = "";

afterEach(async () => {
  cancelSelfControlExpiryTimer();
  resetSelfControlStatusCache();
  setSelfControlPluginConfig(undefined);
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
    tempDir = "";
    hostsFilePath = "";
  }
});

describe("selfcontrol chat flows (e2e)", () => {
  it("POST /api/conversations/:id/messages/stream executes selfcontrol from prior conversation context", async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-selfcontrol-e2e-"),
    );
    hostsFilePath = path.join(tempDir, "hosts");
    await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
    setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

    let turn = 0;
    const runtime = createRuntimeForSelfControlChatTests({
      useModel: vi.fn() as AgentRuntime["useModel"],
      handleMessage: async () => {
        turn += 1;
        if (turn === 1) {
          return {
            responseContent: {
              text: "I can use SelfControl for x.com and twitter.com whenever you want.",
            },
          };
        }

        return {
          responseContent: {
            text: "got it, blocking them now",
            actions: ["BLOCK_WEBSITES"],
          },
        };
      },
    });

    const server = await startApiServer({ port: 0, runtime });
    try {
      const created = await req(server.port, "POST", "/api/conversations", {
        title: "SelfControl e2e",
      });
      expect(created.status).toBe(200);
      const conversationId = String(
        (created.data as { conversation?: { id?: string } }).conversation?.id ??
          "",
      );
      expect(conversationId.length).toBeGreaterThan(0);

      const firstTurn = await req(
        server.port,
        "POST",
        `/api/conversations/${conversationId}/messages`,
        {
          text: "Please remember the websites are x.com and twitter.com, then wait for me to confirm.",
        },
      );
      expect(firstTurn.status).toBe(200);

      const secondTurn = await reqSse(
        server.port,
        `/api/conversations/${conversationId}/messages/stream`,
        {
          text: "nah use self control, block the website plz",
        },
      );

      expect(secondTurn.status).toBe(200);
      const doneEvent = secondTurn.events.find(
        (event) => event.type === "done",
      );
      expect(String(doneEvent?.fullText ?? "")).toContain(
        "got it, blocking them now",
      );
      expect(String(doneEvent?.fullText ?? "")).not.toContain(
        "Started a website block for",
      );
      expect(await fs.readFile(hostsFilePath, "utf8")).toContain(
        "0.0.0.0 x.com",
      );
    } finally {
      await server.close();
    }
  });

  it("POST /api/conversations/:id/messages executes the website blocker fallback when the model answers in prose only", async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-selfcontrol-e2e-"),
    );
    hostsFilePath = path.join(tempDir, "hosts");
    await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
    setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

    let turn = 0;
    const runtime = createRuntimeForSelfControlChatTests({
      useModel: vi.fn() as AgentRuntime["useModel"],
      handleMessage: async () => {
        turn += 1;
        if (turn === 1) {
          return {
            responseContent: {
              text: "got it—x.com and twitter.com are noted. just let me know when you’re ready to block them.",
            },
          };
        }

        return {
          responseContent: {
            text: "got it, blocking x.com and twitter.com for 1 minute.",
            actions: ["REPLY"],
          },
        };
      },
    });

    const server = await startApiServer({ port: 0, runtime });
    try {
      const { conversationId } = await createConversation(server.port, {
        title: "SelfControl fallback",
      });

      const firstTurn = await postConversationMessage(
        server.port,
        conversationId,
        {
          text: "The websites distracting me are x.com and twitter.com. Do not block them yet.",
          mode: "power",
        },
      );
      expect(firstTurn.status).toBe(200);
      expect(await fs.readFile(hostsFilePath, "utf8")).toBe(
        "127.0.0.1 localhost\n",
      );

      const secondTurn = await postConversationMessage(
        server.port,
        conversationId,
        {
          text: "Use self control now. Actually block the websites for 1 minute instead of giving advice.",
          mode: "power",
        },
      );

      expect(secondTurn.status).toBe(200);
      expect(String(secondTurn.data.text ?? "")).toContain(
        "got it, blocking x.com and twitter.com for 1 minute.",
      );
      expect(String(secondTurn.data.text ?? "")).not.toContain(
        "Started a website block for",
      );
      const hostsFile = await fs.readFile(hostsFilePath, "utf8");
      expect(hostsFile).toContain("0.0.0.0 x.com");
      expect(hostsFile).toContain("0.0.0.0 twitter.com");
    } finally {
      await server.close();
    }
  });

  it("POST /api/conversations/:id/messages executes the website blocking permission fallback from prose-only replies", async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-selfcontrol-e2e-"),
    );
    hostsFilePath = path.join(tempDir, "hosts");
    await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
    setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

    const runtime = createRuntimeForSelfControlChatTests({
      useModel: vi.fn() as AgentRuntime["useModel"],
      handleMessage: async () => ({
        responseContent: {
          text: "understood, making sure I have permission to block websites on this machine now",
        },
      }),
    });

    const server = await startApiServer({ port: 0, runtime });
    try {
      const { conversationId } = await createConversation(server.port, {
        title: "SelfControl permission",
      });
      const response = await postConversationMessage(
        server.port,
        conversationId,
        {
          text: "please give yourself permission to block websites on this machine",
          mode: "power",
        },
      );

      expect(response.status).toBe(200);
      expect(String(response.data.text ?? "")).toContain(
        "system hosts file directly",
      );
    } finally {
      await server.close();
    }
  });

  it("does not misclassify blocker permission requests that mention a hostname as a block action", async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-selfcontrol-e2e-"),
    );
    hostsFilePath = path.join(tempDir, "hosts");
    await fs.writeFile(hostsFilePath, "127.0.0.1 localhost\n", "utf8");
    setSelfControlPluginConfig({ hostsFilePath, statusCacheTtlMs: 0 });

    const runtime = createRuntimeForSelfControlChatTests({
      useModel: vi.fn() as AgentRuntime["useModel"],
      handleMessage: async () => ({
        responseContent: {
          text: "understood, making sure I have permission to block x.com on this machine now",
        },
      }),
    });

    const server = await startApiServer({ port: 0, runtime });
    try {
      const { conversationId } = await createConversation(server.port, {
        title: "SelfControl hostname permission",
      });
      const response = await postConversationMessage(
        server.port,
        conversationId,
        {
          text: "please give yourself permission to block x.com on this machine",
          mode: "power",
        },
      );

      expect(response.status).toBe(200);
      expect(String(response.data.text ?? "")).toContain(
        "system hosts file directly",
      );
      expect(await fs.readFile(hostsFilePath, "utf8")).toBe(
        "127.0.0.1 localhost\n",
      );
    } finally {
      await server.close();
    }
  });
});
