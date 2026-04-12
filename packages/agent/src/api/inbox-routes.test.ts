import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import type { Memory } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboxRoute } from "./inbox-routes.js";
import type { RouteHelpers } from "./route-helpers.js";

function createMemory(memory: Partial<Memory>): Memory {
  return {
    id: "",
    agentId: "agent-1",
    entityId: "user-1",
    roomId: "room-1",
    createdAt: 0,
    content: {},
    metadata: {},
    ...memory,
  } as Memory;
}

type JsonRouteHelperMock = ReturnType<typeof vi.fn> & RouteHelpers["json"];

function createHelpers(json: JsonRouteHelperMock): RouteHelpers {
  return {
    json,
    error: vi.fn(),
    readJsonBody: vi.fn(),
  };
}

let tempStateDir = "";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  tempStateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "milady-discord-avatar-cache-"),
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

describe("handleInboxRoute", () => {
  it("prefers the explicit Discord-sent assistant memory over the shadow fallback", async () => {
    const roomId = "room-1";
    const replyToMessageId = "reply-1";
    const agentId = "agent-1";
    const shadowAssistantMemory = createMemory({
      id: "shadow-memory",
      agentId,
      entityId: agentId,
      roomId,
      createdAt: 1_000,
      content: {
        text: "of course",
        inReplyTo: replyToMessageId,
      },
    });
    const connectorAssistantMemory = createMemory({
      id: "discord-memory",
      agentId,
      entityId: agentId,
      roomId,
      createdAt: 1_001,
      content: {
        text: "of course",
        source: "discord",
        inReplyTo: replyToMessageId,
      },
      metadata: {
        replyToSenderName: "shaw",
      },
    });

    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi
        .fn()
        .mockResolvedValue([shadowAssistantMemory, connectorAssistantMemory]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn() as JsonRouteHelperMock;
    const handled = await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&roomSource=discord&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    expect(handled).toBe(true);
    expect(json).toHaveBeenCalledTimes(1);
    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        id: string;
        replyToSenderName?: string;
        source: string;
        text: string;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        id: "discord-memory",
        replyToSenderName: "shaw",
        source: "discord",
        text: "of course",
      }),
    ]);
  });

  it("caches discord-local sender avatars using canonical Discord source handling", async () => {
    const runtime = {
      agentId: "agent-1",
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi.fn().mockResolvedValue([
        createMemory({
          id: "discord-local-memory",
          entityId: "user-1",
          roomId: "room-1",
          createdAt: 1_000,
          content: {
            text: "hello from local discord",
            source: "discord-local",
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
        }),
      ]),
      getService: vi.fn().mockReturnValue(undefined),
      getEntityById: vi.fn().mockResolvedValue(null),
    } as any;
    const json = vi.fn() as JsonRouteHelperMock;

    const handled = await handleInboxRoute(
      {
        url: "/api/inbox/messages?roomId=room-1&roomSource=discord-local&sources=discord-local",
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    expect(handled).toBe(true);
    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        avatarUrl?: string;
        from?: string;
        fromUserName?: string;
        source: string;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        source: "discord-local",
        from: "Shaw",
        fromUserName: "shawmakesmagic",
        avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
      }),
    ]);
  });

  it("still returns assistant connector replies when only the fallback memory exists", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const shadowAssistantMemory = createMemory({
      id: "shadow-memory",
      agentId,
      entityId: agentId,
      roomId,
      createdAt: 1_000,
      content: {
        text: "you're almost there. one small push and it's out of your head.",
      },
    });

    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi.fn().mockResolvedValue([shadowAssistantMemory]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn() as JsonRouteHelperMock;
    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&roomSource=discord&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{ id: string; source: string; text: string }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        id: "shadow-memory",
        source: "discord",
        text: "you're almost there. one small push and it's out of your head.",
      }),
    ]);
  });

  it("dedupes Discord assistant shadows by responseId even when the explicit send arrives later", async () => {
    const roomId = "room-1";
    const replyToMessageId = "reply-1";
    const responseId = "response-1";
    const agentId = "agent-1";
    const shadowAssistantMemory = createMemory({
      id: "shadow-memory",
      agentId,
      entityId: agentId,
      roomId,
      createdAt: 1_000,
      content: {
        text: "of course",
        inReplyTo: replyToMessageId,
        responseId,
      },
    });
    const connectorAssistantMemory = createMemory({
      id: "discord-memory",
      agentId,
      entityId: agentId,
      roomId,
      createdAt: 32_000,
      content: {
        text: "of course",
        source: "discord",
        inReplyTo: replyToMessageId,
        responseId,
        url: "https://discord.test/channels/1/2/3",
      },
      metadata: {
        replyToSenderName: "shaw",
      },
    });

    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi
        .fn()
        .mockResolvedValue([shadowAssistantMemory, connectorAssistantMemory]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&roomSource=discord&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        id: string;
        replyToSenderName?: string;
        source: string;
        text: string;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        id: "discord-memory",
        replyToSenderName: "shaw",
        source: "discord",
        text: "of course",
      }),
    ]);
  });

  it("hides unsent Discord planner memories when the same turn produced real callback messages", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const inboundMessageId = "user-message";
    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi.fn().mockResolvedValue([
        createMemory({
          id: inboundMessageId,
          agentId,
          entityId: "user-1",
          roomId,
          createdAt: 1_000,
          content: {
            text: "hey @remilio nubilio @eliza can you guys work together",
            source: "discord",
          },
          metadata: {
            entityName: "shaw",
          },
        }),
        createMemory({
          id: "planner-shadow",
          agentId,
          entityId: agentId,
          roomId,
          createdAt: 1_100,
          content: {
            text: "on it - two agents, two angles: one tearing lifeops apart, one building the playbook to get it live. they'll post the reports when ready.",
            inReplyTo: inboundMessageId,
          },
        }),
        createMemory({
          id: "discord-launching",
          agentId,
          entityId: agentId,
          roomId,
          createdAt: 1_200,
          content: {
            text: "Launching 2 agents...",
            source: "discord",
            inReplyTo: inboundMessageId,
            url: "https://discord.test/channels/1/2/launching",
          },
        }),
        createMemory({
          id: "discord-spawn-1",
          agentId,
          entityId: agentId,
          roomId,
          createdAt: 1_300,
          content: {
            text: '[1/2] Spawned claude agent as "lifeops-review-1"',
            source: "discord",
            inReplyTo: inboundMessageId,
            url: "https://discord.test/channels/1/2/spawn-1",
          },
        }),
        createMemory({
          id: "discord-summary",
          agentId,
          entityId: agentId,
          roomId,
          createdAt: 1_400,
          content: {
            text: 'Launched 2/2 agents:\n- "lifeops-review-1" (claude) [session: pty-1]\n- "lifeops-review-2" (claude) [session: pty-2]',
            source: "discord",
            inReplyTo: inboundMessageId,
            url: "https://discord.test/channels/1/2/summary",
          },
        }),
      ]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&roomSource=discord&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{ id: string; source: string; text: string }>;
    };

    expect(payload.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inboundMessageId,
          source: "discord",
        }),
        expect.objectContaining({
          id: "discord-launching",
          source: "discord",
          text: "Launching 2 agents...",
        }),
        expect.objectContaining({
          id: "discord-spawn-1",
          source: "discord",
        }),
        expect.objectContaining({
          id: "discord-summary",
          source: "discord",
        }),
      ]),
    );
    expect(payload.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "planner-shadow",
        }),
      ]),
    );
  });

  it("collapses Discord reaction memories into reactions on the target message", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const targetMessageId = "target-message";
    const originalMessage = createMemory({
      id: targetMessageId,
      agentId,
      entityId: "user-1",
      roomId,
      createdAt: 1_000,
      content: {
        text: "nice, glad it clicked",
        source: "discord",
      },
      metadata: {
        entityName: "shaw",
      },
    });
    const reactionMemory = createMemory({
      id: "reaction-1",
      agentId,
      entityId: "user-2",
      roomId,
      createdAt: 1_001,
      content: {
        text: '*Added <❤️> to: \\"nice, glad it clicked\\"*',
        source: "discord",
        inReplyTo: targetMessageId,
      },
      metadata: {
        entityName: "James",
        discordReaction: {
          action: "add",
          emoji: "❤️",
          targetMessageId,
        },
      },
    });

    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([]),
      getMemories: vi.fn().mockResolvedValue([originalMessage, reactionMemory]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn();
    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&roomSource=discord&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        id: string;
        reactions?: Array<{ count: number; emoji: string; users?: string[] }>;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        id: targetMessageId,
        reactions: [
          expect.objectContaining({
            emoji: "❤️",
            count: 1,
            users: ["James"],
          }),
        ],
      }),
    ]);
  });

  it("uses room-level Discord source fallback to enrich message sender profiles", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const runtime = {
      agentId,
      getRoom: vi.fn().mockResolvedValue({
        id: roomId,
        source: "discord",
      }),
      getMemories: vi.fn().mockResolvedValue([
        createMemory({
          id: "user-memory",
          agentId,
          entityId: "user-1",
          roomId,
          createdAt: 1_000,
          content: {
            text: "hello from discord",
          },
          metadata: {
            fromId: "user-123",
          },
        }),
      ]),
      getService: vi.fn().mockReturnValue({
        client: {
          users: {
            fetch: vi.fn().mockResolvedValue({
              username: "james_dev",
              globalName: "James",
              displayAvatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-123/james.png",
              avatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-123/james.png",
            }),
          },
        },
      }),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        avatarUrl?: string;
        from?: string;
        fromUserName?: string;
        source: string;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        source: "discord",
        from: "James",
        fromUserName: "james_dev",
        avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
      }),
    ]);
    expect(
      fs.existsSync(path.join(tempStateDir, "cache", "discord-avatars")),
    ).toBe(true);
  });

  it("falls back to the live Discord message author when fromId is missing", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const runtime = {
      agentId,
      getRoom: vi.fn().mockResolvedValue({
        id: roomId,
        source: "discord",
        channel_id: "channel-1",
      }),
      getMemories: vi.fn().mockResolvedValue([
        createMemory({
          id: "user-memory",
          agentId,
          entityId: "user-1",
          roomId,
          createdAt: 1_000,
          content: {
            text: "hello from discord",
          },
          metadata: {
            discordChannelId: "channel-1",
            discordMessageId: "discord-message-1",
          },
        }),
      ]),
      getService: vi.fn().mockReturnValue({
        client: {
          channels: {
            cache: {
              get: vi.fn().mockReturnValue(undefined),
            },
            fetch: vi.fn().mockResolvedValue({
              messages: {
                fetch: vi.fn().mockResolvedValue({
                  member: {
                    displayName: "James",
                  },
                  author: {
                    id: "user-123",
                    username: "james_dev",
                    globalName: "James",
                    displayAvatarURL: () =>
                      "https://cdn.discordapp.com/avatars/user-123/james.png",
                    avatarURL: () =>
                      "https://cdn.discordapp.com/avatars/user-123/james.png",
                  },
                }),
              },
            }),
          },
          users: {
            fetch: vi.fn().mockResolvedValue({
              username: "james_dev",
              globalName: "James",
              displayAvatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-123/james.png",
              avatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-123/james.png",
            }),
          },
        },
      }),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: `/api/inbox/messages?roomId=${roomId}&sources=discord`,
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      count: number;
      messages: Array<{
        avatarUrl?: string;
        from?: string;
        fromUserName?: string;
        source: string;
      }>;
    };
    expect(payload.count).toBe(1);
    expect(payload.messages).toEqual([
      expect.objectContaining({
        source: "discord",
        from: "James",
        fromUserName: "james_dev",
        avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
      }),
    ]);
  });

  it("uses room-level Discord metadata to keep channel rows named and visible", async () => {
    const roomId = "room-1";
    const agentId = "agent-1";
    const runtime = {
      agentId,
      getAllWorlds: vi
        .fn()
        .mockResolvedValue([{ id: "world-1", name: "Milady Guild" }]),
      getRoomsByWorlds: vi.fn().mockResolvedValue([
        {
          id: roomId,
          source: "discord",
          channel_id: "channel-1",
          name: "default",
          room_type: "GROUP",
          worldId: "world-1",
        },
      ]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        createMemory({
          id: "user-memory",
          agentId,
          entityId: "user-1",
          roomId,
          createdAt: 1_000,
          content: {
            text: "still working",
          },
          metadata: {
            entityName: "James",
            entityAvatarUrl:
              "https://cdn.discordapp.com/avatars/user-456/james-stored.png",
            fromId: "user-456",
          },
        }),
      ]),
      getMemories: vi.fn().mockResolvedValue([]),
      getService: vi.fn().mockReturnValue({
        client: {
          channels: {
            cache: {
              get: vi.fn().mockReturnValue(undefined),
            },
            fetch: vi.fn().mockResolvedValue({
              name: "milady",
            }),
          },
          users: {
            fetch: vi.fn().mockResolvedValue({
              username: "james_dev",
              globalName: "James",
              displayAvatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-456/james-live.png",
              avatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-456/james-live.png",
            }),
          },
        },
      }),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: "/api/inbox/chats?sources=discord",
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/chats",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      chats: Array<{
        avatarUrl?: string;
        source: string;
        title: string;
        worldId?: string;
        worldLabel: string;
      }>;
      count: number;
    };
    expect(payload.count).toBe(1);
    expect(payload.chats).toEqual([
      expect.objectContaining({
        source: "discord",
        title: "milady",
        worldId: "world-1",
        worldLabel: "Milady Guild",
        avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
      }),
    ]);
  });

  it("backfills older Discord rooms that fall outside the recent bulk memory slice", async () => {
    const agentId = "agent-1";
    const visibleRoomId = "room-visible";
    const missingRoomId = "room-missing";
    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([{ id: "world-1" }]),
      getRoomsByWorlds: vi.fn().mockResolvedValue([
        {
          id: visibleRoomId,
          source: "discord",
          channel_id: "channel-visible",
          name: "default",
          room_type: "GROUP",
          created_at: "2026-04-09T05:00:00.000Z",
        },
        {
          id: missingRoomId,
          source: "discord",
          channel_id: "1481030966565797888",
          name: "default",
          room_type: "GROUP",
          created_at: "2026-04-09T04:00:00.000Z",
        },
      ]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        createMemory({
          id: "visible-memory",
          agentId,
          entityId: "user-visible",
          roomId: visibleRoomId,
          createdAt: 2_000,
          content: {
            text: "latest visible message",
            source: "discord",
          },
          metadata: {
            entityName: "shaw",
            fromId: "user-visible-raw",
          },
        }),
      ]),
      getMemories: vi
        .fn()
        .mockImplementation(({ roomId }: { roomId: string }) =>
          Promise.resolve(
            roomId === missingRoomId
              ? [
                  createMemory({
                    id: "missing-memory",
                    agentId,
                    entityId: "user-missing",
                    roomId: missingRoomId,
                    createdAt: 1_000,
                    content: {
                      text: "older room message",
                      source: "discord",
                    },
                    metadata: {
                      entityName: "James",
                      fromId: "user-missing-raw",
                    },
                  }),
                ]
              : [],
          ),
        ),
      getService: vi.fn().mockReturnValue({
        client: {
          channels: {
            cache: {
              get: vi.fn().mockReturnValue(undefined),
            },
            fetch: vi.fn().mockImplementation(async (channelId: string) => ({
              name:
                channelId === "1481030966565797888" ? "milady" : "general-chat",
            })),
          },
          users: {
            fetch: vi.fn().mockImplementation(async (userId: string) => ({
              username: userId,
              globalName: userId === "user-missing-raw" ? "James" : "shaw",
              displayAvatarURL: () =>
                `https://cdn.discordapp.com/avatars/${userId}/avatar.png`,
              avatarURL: () =>
                `https://cdn.discordapp.com/avatars/${userId}/avatar.png`,
            })),
          },
        },
      }),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: "/api/inbox/chats?sources=discord",
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/chats",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      chats: Array<{
        avatarUrl?: string;
        id: string;
        title: string;
      }>;
      count: number;
    };
    expect(payload.count).toBe(2);
    expect(payload.chats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missingRoomId,
          title: "milady",
          avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
        }),
      ]),
    );
  });

  it("recovers Discord rooms from recent message history when room enumeration misses them", async () => {
    const agentId = "agent-1";
    const visibleRoomId = "room-visible";
    const missingRoomId = "room-missing";
    const orphanMemory = createMemory({
      id: "orphan-memory",
      agentId,
      entityId: "user-missing",
      roomId: missingRoomId,
      createdAt: 1_500,
      content: {
        text: "orphaned room message",
        source: "discord",
      },
      metadata: {
        discordChannelId: "1481030966565797888",
        discordMessageId: "discord-message-1",
        entityName: "James",
        fromId: "user-missing-raw",
      },
    });
    const runtime = {
      agentId,
      getAllWorlds: vi.fn().mockResolvedValue([{ id: "world-1" }]),
      getRoomsByWorlds: vi.fn().mockResolvedValue([
        {
          id: visibleRoomId,
          source: "discord",
          channel_id: "channel-visible",
          name: "default",
          room_type: "GROUP",
        },
      ]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        createMemory({
          id: "visible-memory",
          agentId,
          entityId: "user-visible",
          roomId: visibleRoomId,
          createdAt: 2_000,
          content: {
            text: "latest visible message",
            source: "discord",
          },
          metadata: {
            entityName: "shaw",
            fromId: "user-visible-raw",
          },
        }),
      ]),
      getMemories: vi
        .fn()
        .mockImplementation((params: { roomId?: string }) =>
          Promise.resolve(
            params.roomId === missingRoomId
              ? [orphanMemory]
              : params.roomId
                ? []
                : [orphanMemory],
          ),
        ),
      getService: vi.fn().mockReturnValue({
        client: {
          channels: {
            cache: {
              get: vi.fn().mockReturnValue(undefined),
            },
            fetch: vi.fn().mockImplementation(async (channelId: string) => ({
              name:
                channelId === "1481030966565797888" ? "milady" : "general-chat",
              messages: {
                fetch: vi.fn().mockResolvedValue({
                  member: {
                    displayName: "James",
                  },
                  author: {
                    id: "user-missing-raw",
                    username: "james_dev",
                    globalName: "James",
                    displayAvatarURL: () =>
                      "https://cdn.discordapp.com/avatars/user-missing-raw/avatar.png",
                    avatarURL: () =>
                      "https://cdn.discordapp.com/avatars/user-missing-raw/avatar.png",
                  },
                }),
              },
            })),
          },
          users: {
            fetch: vi.fn().mockResolvedValue({
              username: "james_dev",
              globalName: "James",
              displayAvatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-missing-raw/avatar.png",
              avatarURL: () =>
                "https://cdn.discordapp.com/avatars/user-missing-raw/avatar.png",
            }),
          },
        },
      }),
    } as any;
    const json = vi.fn();

    await handleInboxRoute(
      {
        url: "/api/inbox/chats?sources=discord",
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/chats",
      "GET",
      { runtime },
      createHelpers(json),
    );

    const payload = json.mock.calls[0]?.[1] as {
      chats: Array<{
        avatarUrl?: string;
        id: string;
        title: string;
      }>;
      count: number;
    };
    expect(payload.count).toBe(2);
    expect(payload.chats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missingRoomId,
          title: "milady",
          avatarUrl: expect.stringMatching(/^\/api\/avatar\/discord\//),
        }),
      ]),
    );
  });

  it("sends inbox replies through the transport source handler", async () => {
    const roomId = "room-bluebubbles";
    const runtime = {
      agentId: "agent-1",
      sendHandlers: new Map([["bluebubbles", {}]]),
      sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
      getRoom: vi.fn().mockResolvedValue({
        id: roomId,
        channelId: "chat-guid-1",
        serverId: "world-1",
      }),
      getMemories: vi.fn().mockResolvedValue([]),
      getService: vi.fn().mockReturnValue(undefined),
    } as any;
    const json = vi.fn() as JsonRouteHelperMock;
    const helpers = createHelpers(json);
    helpers.readJsonBody = vi.fn().mockResolvedValue({
      roomId,
      source: "bluebubbles",
      text: "On it",
    });

    const handled = await handleInboxRoute(
      {
        url: "/api/inbox/messages",
      } as http.IncomingMessage,
      {} as http.ServerResponse,
      "/api/inbox/messages",
      "POST",
      { runtime },
      helpers,
    );

    expect(handled).toBe(true);
    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      {
        source: "bluebubbles",
        roomId,
        channelId: "chat-guid-1",
        serverId: "world-1",
      },
      {
        source: "bluebubbles",
        text: "On it",
      },
    );
    expect(json).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ok: true }),
    );
  });
});
