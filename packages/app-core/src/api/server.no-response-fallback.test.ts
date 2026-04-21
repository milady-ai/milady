import http from "node:http";
import { logger, type AgentRuntime, type UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

function reqSse(
  port: number,
  path: string,
  body: Record<string, unknown>,
): Promise<{
  status: number;
  events: Array<Record<string, unknown>>;
}> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const events = raw
            .split("\n\n")
            .map((block) => block.trim())
            .filter((block) => block.length > 0)
            .flatMap((block) =>
              block
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .filter((line) => line.length > 0)
                .map((line) => {
                  try {
                    return JSON.parse(line) as Record<string, unknown>;
                  } catch {
                    return {};
                  }
                }),
            );
          resolve({ status: res.statusCode ?? 0, events });
        });
      },
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

describe("conversation no-response fallback", () => {
  const originalChatGenerationTimeoutEnv =
    process.env.MILADY_CHAT_GENERATION_TIMEOUT_MS;
  let port = 0;
  let close: () => Promise<void> = async () => {};
  let updateRuntime: (runtime: AgentRuntime) => void = () => {};

  const createMemory = vi.fn(async () => undefined);
  const getMemories = vi.fn(async () => []);
  const handleMessage = vi.fn(async () => ({
    responseContent: { text: "(no response)" },
    responseMessages: [],
  }));
  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000999" as UUID,
    character: {
      name: "Reimu",
      postExamples: ["Reimu default fallback post."],
    },
    ensureConnection: vi.fn(async () => undefined),
    getWorld: vi.fn(async () => null),
    updateWorld: vi.fn(async () => undefined),
    getMemories,
    createMemory,
    getService: vi.fn(() => null),
    messageService: {
      handleMessage,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    adapter: {},
  } as unknown as AgentRuntime;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
    updateRuntime = server.updateRuntime;
  }, 30_000);

  afterAll(async () => {
    if (originalChatGenerationTimeoutEnv === undefined) {
      delete process.env.MILADY_CHAT_GENERATION_TIMEOUT_MS;
    } else {
      process.env.MILADY_CHAT_GENERATION_TIMEOUT_MS =
        originalChatGenerationTimeoutEnv;
    }
    await close();
  });

  it("uses the provider issue fallback when chat generation returns no response", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockClear();

    const created = await req(port, "POST", "/api/conversations", {
      title: "Fallback thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Sorry, I'm having a provider issue",
      agentName: "Reimu",
    });
  });

  it("uses the provider issue fallback when chat generation returns only a stage direction", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockResolvedValueOnce({
      responseContent: { text: "*waves warmly*" },
      responseMessages: [],
    });

    const created = await req(port, "POST", "/api/conversations", {
      title: "Stage direction fallback thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello again",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Sorry, I'm having a provider issue",
      agentName: "Reimu",
    });
  });

  it("returns an empty reply when generation intentionally ignores the message", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockResolvedValueOnce({
      didRespond: false,
      responseMessages: [],
      mode: "none",
    });

    const created = await req(port, "POST", "/api/conversations", {
      title: "Intentional ignore thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "sounds good",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "",
      agentName: "Reimu",
      noResponseReason: "ignored",
    });
    expect(createMemory).toHaveBeenCalledTimes(1);
  });

  it("streams an empty done event when generation intentionally ignores the message", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockResolvedValueOnce({
      didRespond: false,
      responseMessages: [],
      mode: "none",
    });

    const created = await req(port, "POST", "/api/conversations", {
      title: "Intentional ignore stream thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await reqSse(
      port,
      `/api/conversations/${conversationId}/messages/stream`,
      {
        text: "sounds good again",
      },
    );

    expect(response.status).toBe(200);
    expect(response.events).toContainEqual(
      expect.objectContaining({
        type: "done",
        fullText: "",
        agentName: "Reimu",
        noResponseReason: "ignored",
      }),
    );
    expect(createMemory).toHaveBeenCalledTimes(1);
  });

  it("surfaces an Eliza Cloud credits reply when generation fails for insufficient funds", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockRejectedValueOnce(
      Object.assign(new Error("Insufficient funds. Please add credits."), {
        status: 402,
        error: { type: "insufficient_funds" },
      }),
    );

    const created = await req(port, "POST", "/api/conversations", {
      title: "Insufficient funds fallback thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello cloud",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Eliza Cloud credits are depleted. Top up the cloud balance and try again.",
      agentName: "Reimu",
    });
  });

  it("replaces the generic provider issue reply when recent logs show insufficient funds", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockResolvedValueOnce({
      responseContent: { text: "Sorry, I'm having a provider issue" },
      responseMessages: [],
    });

    logger.error(
      "#Chen Model call failed: Error: Insufficient funds. Please add credits.",
    );

    const created = await req(port, "POST", "/api/conversations", {
      title: "Insufficient funds logged thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello credits",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Eliza Cloud credits are depleted. Top up the cloud balance and try again.",
      agentName: "Reimu",
    });
  });

  it("uses the provider issue fallback when chat generation times out", async () => {
    process.env.MILADY_CHAT_GENERATION_TIMEOUT_MS = "1000";
    const isolatedServer = await startApiServer({ port: 0 });
    isolatedServer.updateRuntime(runtime);
    try {
      createMemory.mockClear();
      getMemories.mockClear();
      handleMessage.mockImplementationOnce(
        async () =>
          await new Promise<never>(() => {
            // Intentionally never resolves.
          }),
      );

      const created = await req(
        isolatedServer.port,
        "POST",
        "/api/conversations",
        {
          title: "Timed out fallback thread",
        },
      );
      expect(created.status).toBe(200);
      const conversationId = String(
        (created.data.conversation as { id?: string } | undefined)?.id ?? "",
      );
      expect(conversationId).not.toBe("");

      const response = await req(
        isolatedServer.port,
        "POST",
        `/api/conversations/${conversationId}/messages`,
        {
          text: "hello timeout",
        },
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        text: "Sorry, I'm having a provider issue",
        agentName: "Reimu",
      });
    } finally {
      await isolatedServer.close();
    }
  });
});
