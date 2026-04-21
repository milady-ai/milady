import type { Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole, mockResolveCanonicalOwnerIdForMessage } =
  vi.hoisted(() => ({
    mockCheckSenderRole: vi.fn(),
    mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  }));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: mockCheckSenderRole,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

import { createAdminPanelProvider } from "./admin-panel";

const AGENT_ID = "agent-aaa" as UUID;
const OWNER_ID = "owner-bbb" as UUID;
const ROOM_ID = "room-ccc" as UUID;
const WORLD_ID = "world-ddd" as UUID;
const CHAT_ROOM_ID = "chat-room-eee" as UUID;

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: AGENT_ID,
    getRoom: vi.fn().mockImplementation(async (id: string) => {
      if (id === ROOM_ID) {
        return { id: ROOM_ID, worldId: WORLD_ID, source: "discord" };
      }
      if (id === CHAT_ROOM_ID) {
        return { id: CHAT_ROOM_ID, worldId: WORLD_ID, source: "client_chat" };
      }
      return null;
    }),
    getWorld: vi.fn().mockResolvedValue({
      id: WORLD_ID,
      metadata: { ownership: { ownerId: OWNER_ID } },
    }),
    getSetting: vi.fn().mockReturnValue(null),
    getRoomsForParticipant: vi.fn().mockResolvedValue([CHAT_ROOM_ID]),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: OWNER_ID,
    roomId: ROOM_ID,
    content: { text: "hello", source: "discord" },
    ...overrides,
  } as Memory;
}

describe("adminPanelProvider", () => {
  const provider = createAdminPanelProvider();

  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockCheckSenderRole.mockResolvedValue({
      entityId: OWNER_ID,
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(OWNER_ID);
  });

  it("returns empty for non-admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "random-user",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const result = await provider.get(
      makeRuntime(),
      makeMessage({ entityId: "random-user" }),
      {} as never,
    );

    expect(result.values).toEqual({ hasAdminChat: false });
    expect(result.text).toBe("");
  });

  it("returns empty when room has no world", async () => {
    const runtime = makeRuntime({
      getRoom: vi.fn().mockResolvedValue({ id: ROOM_ID, worldId: null }),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.text).toBe("");
    expect(result.data).toEqual({ messageCount: 0 });
  });

  it("uses the configured canonical owner even when the current room has no world", async () => {
    const runtime = makeRuntime({
      getRoom: vi.fn().mockImplementation(async (id: string) => {
        if (id === ROOM_ID) {
          return { id: ROOM_ID, worldId: null, source: "discord" };
        }
        if (id === CHAT_ROOM_ID) {
          return { id: CHAT_ROOM_ID, worldId: WORLD_ID, source: "client_chat" };
        }
        return null;
      }),
      getSetting: vi
        .fn()
        .mockImplementation((key: string) =>
          key === "ELIZA_ADMIN_ENTITY_ID" ? OWNER_ID : null,
        ),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        {
          entityId: OWNER_ID,
          content: { text: "hello from the owner" },
          createdAt: Date.now(),
        },
      ]),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.values).toEqual({ hasAdminChat: true });
    expect(result.text).toContain("hello from the owner");
  });

  it("returns empty when owner has no client_chat rooms", async () => {
    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.text).toBe("");
    expect(result.values).toEqual({ hasAdminChat: false });
  });

  it("returns formatted messages from client_chat rooms", async () => {
    const now = Date.now();
    const messages: Partial<Memory>[] = [
      {
        entityId: OWNER_ID,
        content: { text: "remind me about the meeting" },
        createdAt: now - 2000,
      },
      {
        entityId: AGENT_ID,
        content: { text: "Got it, I will remind you." },
        createdAt: now - 1000,
      },
    ];

    const runtime = makeRuntime({
      getMemoriesByRoomIds: vi.fn().mockResolvedValue(messages),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.values).toEqual({ hasAdminChat: true });
    expect(result.data).toEqual({ messageCount: 2 });
    expect(result.text).toContain("# Recent Owner Conversation (Milady App)");
    // Oldest first in output
    expect(result.text).toContain("[Owner] remind me about the meeting");
    expect(result.text).toContain("[Agent] Got it, I will remind you.");
    // Owner line should come before Agent line (chronological)
    const ownerIdx = (result.text as string).indexOf("[Owner]");
    const agentIdx = (result.text as string).indexOf("[Agent]");
    expect(ownerIdx).toBeLessThan(agentIdx);
  });

  it("grants access when caller is the agent itself", async () => {
    // Agent-self messages should not need checkSenderRole
    mockCheckSenderRole.mockResolvedValue(null);

    const messages: Partial<Memory>[] = [
      {
        entityId: OWNER_ID,
        content: { text: "test msg" },
        createdAt: Date.now(),
      },
    ];

    const runtime = makeRuntime({
      getMemoriesByRoomIds: vi.fn().mockResolvedValue(messages),
    });

    const result = await provider.get(
      runtime,
      makeMessage({ entityId: AGENT_ID }),
      {} as never,
    );

    expect(result.values).toEqual({ hasAdminChat: true });
    expect(result.data).toEqual({ messageCount: 1 });
    expect(mockCheckSenderRole).not.toHaveBeenCalled();
  });

  it("truncates output exceeding 2000 chars", async () => {
    const longText = "x".repeat(300);
    const messages: Partial<Memory>[] = Array.from({ length: 20 }, (_, i) => ({
      entityId: OWNER_ID,
      content: { text: longText },
      createdAt: Date.now() - i * 1000,
    }));

    const runtime = makeRuntime({
      getMemoriesByRoomIds: vi.fn().mockResolvedValue(messages),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect((result.text as string).length).toBeLessThanOrEqual(2000);
    expect((result.text as string).endsWith("...")).toBe(true);
  });

  it("filters rooms to only client_chat source", async () => {
    const discordRoomId = "discord-room-fff" as UUID;
    const runtime = makeRuntime({
      getRoomsForParticipant: vi
        .fn()
        .mockResolvedValue([CHAT_ROOM_ID, discordRoomId]),
      getRoom: vi.fn().mockImplementation(async (id: string) => {
        if (id === ROOM_ID) {
          return { id: ROOM_ID, worldId: WORLD_ID, source: "discord" };
        }
        if (id === CHAT_ROOM_ID) {
          return { id: CHAT_ROOM_ID, source: "client_chat" };
        }
        if (id === discordRoomId) {
          return { id: discordRoomId, source: "discord" };
        }
        return null;
      }),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    });

    await provider.get(runtime, makeMessage(), {} as never);

    // getMemoriesByRoomIds should only receive the client_chat room
    const call = (runtime as { getMemoriesByRoomIds: ReturnType<typeof vi.fn> })
      .getMemoriesByRoomIds.mock.calls[0][0];
    expect(call.roomIds).toEqual([CHAT_ROOM_ID]);
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("adminPanel");
    expect(provider.dynamic).toBe(true);
    expect(provider.position).toBe(14);
  });
});
