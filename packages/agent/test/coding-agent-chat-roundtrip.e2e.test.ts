import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime, Content, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

function waitForWsMessage(
  ws: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 5_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf-8") : String(raw);
        const message = JSON.parse(text) as Record<string, unknown>;
        if (predicate(message)) {
          cleanup();
          resolve(message);
        }
      } catch {
        // Ignore malformed websocket frames in tests.
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

type TestSwarmEvent = {
  type: string;
  sessionId: string;
  timestamp: number;
  data?: Record<string, unknown>;
};

class TestSwarmCoordinator {
  isPaused = false;
  private chatCallback:
    | ((text: string, source?: string) => Promise<void>)
    | null = null;
  private wsBroadcast: ((event: TestSwarmEvent) => void) | null = null;

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  setChatCallback(
    callback: (text: string, source?: string) => Promise<void>,
  ): void {
    this.chatCallback = callback;
  }

  setWsBroadcast(callback: (event: TestSwarmEvent) => void): void {
    this.wsBroadcast = callback;
  }

  async registerTaskFromChat(task: string): Promise<string> {
    const sessionId = `session-${crypto.randomUUID()}`;
    this.wsBroadcast?.({
      type: "task_registered",
      sessionId,
      timestamp: Date.now(),
      data: {
        agentType: "codex",
        label: "scratch/html-tetris",
        originalTask: task,
        workdir: `/tmp/${sessionId}`,
      },
    });
    await this.chatCallback?.(
      `Started coding task for: ${task}`,
      "coding-agent",
    );
    return sessionId;
  }
}

function createRuntimeForCodingAgentChatRoundtrip(
  coordinator: TestSwarmCoordinator,
): AgentRuntime {
  const memoriesByRoom = new Map<string, Array<Record<string, unknown>>>();

  const runtimeSubset = {
    agentId: "coding-agent-chat-roundtrip",
    character: {
      name: "CodingAgentChatRoundtrip",
    } as AgentRuntime["character"],
    messageService: {
      handleMessage: async (
        _runtime: AgentRuntime,
        message: Record<string, unknown>,
        onResponse: (content: Content) => Promise<object[]>,
      ) => {
        const prompt =
          typeof (message.content as Record<string, unknown> | undefined)
            ?.text === "string"
            ? String(
                (message.content as Record<string, unknown> | undefined)?.text,
              )
            : "unknown task";

        await coordinator.registerTaskFromChat(prompt);

        const responseText = `I started a coding task for: ${prompt}`;
        await onResponse({ text: responseText } as Content);

        return {
          didRespond: true,
          responseContent: { text: responseText },
          responseMessages: [
            {
              id: crypto.randomUUID() as UUID,
              entityId: "coding-agent-chat-roundtrip",
              roomId: message.roomId as UUID,
              createdAt: Date.now(),
              content: { text: responseText },
            },
          ],
          mode: "power",
        };
      },
    } as AgentRuntime["messageService"],
    ensureConnection: async () => {},
    getWorld: async () => null,
    updateWorld: async () => {},
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
      return current.slice(-count) as unknown as Awaited<
        ReturnType<AgentRuntime["getMemories"]>
      >;
    },
    getRoomsByWorld: async () => [],
    getCache: async () => null,
    setCache: async () => {},
    getService: (serviceType: string) => {
      if (serviceType === "SWARM_COORDINATOR") {
        return coordinator;
      }
      return null;
    },
  };

  return runtimeSubset as unknown as AgentRuntime;
}

describe("Coding agent chat roundtrip", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;
  let ws: WebSocket | null = null;
  let tempStateDir = "";
  let originalStateDir: string | undefined;

  beforeAll(async () => {
    originalStateDir = process.env.ELIZA_STATE_DIR;
    tempStateDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-coding-agent-chat-e2e-"),
    );
    process.env.ELIZA_STATE_DIR = tempStateDir;
    await fs.writeFile(
      path.join(tempStateDir, "eliza.json"),
      JSON.stringify({
        agents: {
          defaults: { workspace: path.join(tempStateDir, "workspace") },
          list: [{ id: "main", default: true, name: "TestAgent" }],
        },
        ui: { theme: "dark" },
        cloud: { enabled: false },
        env: {},
        features: {},
        plugins: { entries: {} },
        database: { provider: "pglite" },
      }),
    );
    await fs.mkdir(path.join(tempStateDir, "workspace"), { recursive: true });

    const runtime = createRuntimeForCodingAgentChatRoundtrip(
      new TestSwarmCoordinator(),
    );
    server = await startApiServer({ port: 0, runtime });
    ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await waitForWsMessage(ws, (message) => message.type === "status");
  }, 30_000);

  afterAll(async () => {
    if (ws) {
      const socket = ws;
      ws = null;
      await new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        socket.once("close", () => resolve());
        socket.terminate();
      });
    }
    if (server) {
      await server.close();
    }
    if (originalStateDir === undefined) {
      delete process.env.ELIZA_STATE_DIR;
    } else {
      process.env.ELIZA_STATE_DIR = originalStateDir;
    }
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
    }
  });

  it("turns a chat message into a coding-agent task event and returns the assistant response", async () => {
    const createConversation = await req(
      server?.port ?? 0,
      "POST",
      "/api/conversations",
      {
        title: "Coding agent roundtrip",
      },
    );
    expect(createConversation.status).toBe(200);

    const conversation = createConversation.data.conversation as {
      id?: string;
    };
    const conversationId = conversation.id ?? "";
    expect(conversationId.length).toBeGreaterThan(0);

    ws?.send(
      JSON.stringify({
        type: "active-conversation",
        conversationId,
      }),
    );

    const taskPrompt = "Make an HTML Tetris game in a scratch workspace.";

    const waitForTaskRegistered = waitForWsMessage(
      ws as WebSocket,
      (message) =>
        message.type === "pty-session-event" &&
        message.eventType === "task_registered",
    );

    const chatResponse = await req(
      server?.port ?? 0,
      "POST",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        text: taskPrompt,
      },
    );

    expect(chatResponse.status).toBe(200);
    expect(String(chatResponse.data.text ?? "")).toContain(
      "I started a coding task for:",
    );
    expect(String(chatResponse.data.text ?? "")).toContain(taskPrompt);

    const taskRegistered = await waitForTaskRegistered;
    expect(taskRegistered.sessionId).toBeTypeOf("string");
    const taskData = taskRegistered.data as Record<string, unknown>;
    expect(taskData.agentType).toBe("codex");
    expect(taskData.label).toBe("scratch/html-tetris");
    expect(taskData.originalTask).toBe(taskPrompt);
    expect(String(taskData.workdir ?? "")).toContain("/tmp/session-");

    const messagesResponse = await req(
      server?.port ?? 0,
      "GET",
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    );
    expect(messagesResponse.status).toBe(200);
    const messages = messagesResponse.data.messages as Array<
      Record<string, unknown>
    >;
    expect(
      messages.some(
        (message) =>
          message.role === "user" && String(message.text ?? "") === taskPrompt,
      ),
    ).toBe(true);
    expect(
      messages.some(
        (message) =>
          message.role === "assistant" &&
          String(message.text ?? "").includes("I started a coding task for:"),
      ),
    ).toBe(true);
    expect(messages.some((message) => message.source === "coding-agent")).toBe(
      false,
    );
  });
});
