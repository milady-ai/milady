import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Memory, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ConversationRouteContext,
  ConversationRouteState,
} from "../../src/api/conversation-routes";
import { handleConversationRoutes } from "../../src/api/conversation-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

let tempStateDir = "";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  tempStateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-conversation-discord-avatars-"),
  );
  process.env.MILADY_STATE_DIR = tempStateDir;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "image/png" : null,
    },
    arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
  })) as typeof fetch;
});

afterEach(() => {
  delete process.env.MILADY_STATE_DIR;
  globalThis.fetch = originalFetch;
  if (tempStateDir) {
    fs.rmSync(tempStateDir, { recursive: true, force: true });
    tempStateDir = "";
  }
});

function buildState(memories: Memory[]): ConversationRouteState {
  return {
    runtime: {
      agentId: "agent-1" as UUID,
      getMemories: vi.fn(async () => memories),
      getEntityById: vi.fn(async () => null),
      getService: vi.fn(() => null),
    } as unknown as ConversationRouteState["runtime"],
    config: {} as ConversationRouteState["config"],
    agentName: "Milady",
    adminEntityId: null,
    chatUserId: null,
    logBuffer: [],
    conversations: new Map([
      [
        "conv-1",
        {
          id: "conv-1",
          title: "Discord Chat",
          roomId: "room-1" as UUID,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    ]),
    conversationRestorePromise: null,
    deletedConversationIds: new Set(),
    broadcastWs: null,
  };
}

function buildCtx(state: ConversationRouteState): ConversationRouteContext {
  const { res } = createMockHttpResponse();
  return {
    req: createMockIncomingMessage({
      method: "GET",
      url: "/api/conversations/conv-1/messages",
    }),
    res,
    method: "GET",
    pathname: "/api/conversations/conv-1/messages",
    state,
    json: vi.fn((response, data, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    }),
    error: vi.fn((response, message, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => null),
  };
}

describe("conversation-routes", () => {
  test("GET /api/conversations/:id/messages caches discord-local sender avatars", async () => {
    const state = buildState([
      {
        id: "msg-1" as UUID,
        agentId: "agent-1" as UUID,
        entityId: "user-1" as UUID,
        roomId: "room-1" as UUID,
        createdAt: 1,
        content: {
          source: "discord-local",
          text: "hello from discord",
        },
        metadata: {
          entityName: "Shaw",
          entityUserName: "shawmakesmagic",
          entityAvatarUrl:
            "https://cdn.discordapp.com/avatars/498273781589213185/avatar.png",
          fromId: "498273781589213185",
          discordChannelId: "channel-1",
          discordMessageId: "message-1",
        },
      } as Memory,
    ]);
    const ctx = buildCtx(state);

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    const payload = (ctx.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      messages: Array<{
        avatarUrl?: string;
        from?: string;
        fromUserName?: string;
        source?: string;
      }>;
    };
    expect(payload.messages).toEqual([
      expect.objectContaining({
        source: "discord-local",
        from: "Shaw",
        fromUserName: "shawmakesmagic",
        avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
      }),
    ]);
    expect(
      fs.existsSync(path.join(tempStateDir, "cache", "discord-avatars")),
    ).toBe(true);
  });
});
