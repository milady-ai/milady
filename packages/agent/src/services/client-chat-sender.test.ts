import type { Content, IAgentRuntime, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { ConversationMeta, ServerState } from "../api/server.js";
import { registerClientChatSendHandler } from "./client-chat-sender.js";

/** Minimal mock runtime that captures registerSendHandler calls. */
function makeMockRuntime(): IAgentRuntime & {
  _handlers: Map<string, (rt: IAgentRuntime, target: unknown, content: Content) => Promise<void>>;
} {
  const handlers = new Map<
    string,
    (rt: IAgentRuntime, target: unknown, content: Content) => Promise<void>
  >();
  return {
    agentId: "agent-1" as UUID,
    registerSendHandler: vi.fn((source: string, handler) => {
      handlers.set(source, handler);
    }),
    createMemory: vi.fn(async () => {}),
    _handlers: handlers,
  } as unknown as IAgentRuntime & {
    _handlers: Map<string, (rt: IAgentRuntime, target: unknown, content: Content) => Promise<void>>;
  };
}

function makeConversation(
  id: string,
  roomId: UUID,
  updatedAt = new Date().toISOString(),
): ConversationMeta {
  return {
    id,
    title: `Conversation ${id}`,
    roomId,
    createdAt: updatedAt,
    updatedAt,
  };
}

function makeMockState(
  conversations: ConversationMeta[] = [],
  activeConversationId: string | null = null,
): ServerState {
  const map = new Map<string, ConversationMeta>();
  for (const c of conversations) map.set(c.id, c);
  return {
    conversations: map,
    activeConversationId,
    broadcastWs: vi.fn(),
  } as unknown as ServerState;
}

describe("registerClientChatSendHandler", () => {
  it("registers a handler for 'client_chat' source", () => {
    const rt = makeMockRuntime();
    const state = makeMockState();
    registerClientChatSendHandler(rt, state);
    expect(rt.registerSendHandler).toHaveBeenCalledWith(
      "client_chat",
      expect.any(Function),
    );
  });

  it("persists memory and broadcasts WS message to active conversation", async () => {
    const rt = makeMockRuntime();
    const conv = makeConversation("conv-1", "room-abc" as UUID);
    const state = makeMockState([conv], "conv-1");
    registerClientChatSendHandler(rt, state);

    const handler = rt._handlers.get("client_chat")!;
    expect(handler).toBeDefined();

    await handler(rt, { source: "client_chat" }, { text: "Hello from agent" } as Content);

    expect(rt.createMemory).toHaveBeenCalledTimes(1);
    const memoryArg = (rt.createMemory as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(memoryArg.content.text).toBe("Hello from agent");
    expect(memoryArg.content.source).toBe("client_chat");
    expect(memoryArg.roomId).toBe("room-abc");

    expect(state.broadcastWs).toHaveBeenCalledTimes(1);
    const wsPayload = (state.broadcastWs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(wsPayload.type).toBe("proactive-message");
    expect(wsPayload.conversationId).toBe("conv-1");
    expect(wsPayload.message.text).toBe("Hello from agent");
    expect(wsPayload.message.source).toBe("client_chat");
    expect(wsPayload.message.role).toBe("assistant");
  });

  it("resolves conversation by roomId when target.roomId is provided", async () => {
    const rt = makeMockRuntime();
    const conv1 = makeConversation("conv-1", "room-aaa" as UUID);
    const conv2 = makeConversation("conv-2", "room-bbb" as UUID);
    const state = makeMockState([conv1, conv2], "conv-1");
    registerClientChatSendHandler(rt, state);

    const handler = rt._handlers.get("client_chat")!;
    await handler(
      rt,
      { source: "client_chat", roomId: "room-bbb" as UUID },
      { text: "targeted" } as Content,
    );

    const wsPayload = (state.broadcastWs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(wsPayload.conversationId).toBe("conv-2");
  });

  it("falls back to most recent conversation when no active or roomId", async () => {
    const rt = makeMockRuntime();
    const older = makeConversation("conv-old", "room-old" as UUID, "2024-01-01T00:00:00Z");
    const newer = makeConversation("conv-new", "room-new" as UUID, "2025-06-01T00:00:00Z");
    const state = makeMockState([older, newer], null);
    registerClientChatSendHandler(rt, state);

    const handler = rt._handlers.get("client_chat")!;
    await handler(rt, { source: "client_chat" }, { text: "fallback" } as Content);

    const wsPayload = (state.broadcastWs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(wsPayload.conversationId).toBe("conv-new");
  });

  it("silently returns when no conversations exist", async () => {
    const rt = makeMockRuntime();
    const state = makeMockState([], null);
    registerClientChatSendHandler(rt, state);

    const handler = rt._handlers.get("client_chat")!;
    await handler(rt, { source: "client_chat" }, { text: "nobody home" } as Content);

    expect(rt.createMemory).not.toHaveBeenCalled();
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });
});
