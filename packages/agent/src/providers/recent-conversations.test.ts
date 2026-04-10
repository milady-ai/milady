import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { recentConversationsProvider } from "./recent-conversations";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as never;
}

function makeMessage(entityId: string) {
  return {
    entityId,
    roomId: "room-current",
    content: { text: "hello", source: "client_chat" },
  } as never;
}

describe("recentConversationsProvider", () => {
  it("returns empty when no entityId", async () => {
    const runtime = makeRuntime();
    const result = await recentConversationsProvider.get(
      runtime,
      { content: {}, roomId: "r" } as never,
      {} as never,
    );
    expect(result.text).toBe("");
  });

  it("returns empty when user has no rooms", async () => {
    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    });
    const result = await recentConversationsProvider.get(
      runtime,
      makeMessage("user-1"),
      {} as never,
    );
    expect(result.text).toBe("");
  });

  it("returns formatted messages when rooms have messages", async () => {
    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue(["room-1"]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        {
          id: "m1",
          roomId: "room-1",
          entityId: "user-1",
          content: { text: "hey there", source: "discord" },
          metadata: {
            entityName: "Shaw",
            entityUserName: "shawmakesmagic",
          },
          createdAt: Date.now() - 30_000,
        },
        {
          id: "m2",
          roomId: "room-1",
          entityId: "agent-1",
          content: { text: "hello!" },
          createdAt: Date.now() - 20_000,
        },
      ]),
      getRoom: vi.fn().mockResolvedValue({
        id: "room-1",
        type: "dm",
        name: "general",
        source: "discord",
      }),
    });

    const result = await recentConversationsProvider.get(
      runtime,
      makeMessage("user-1"),
      {} as never,
    );

    expect(result.text).toContain("Recent conversations:");
    expect(result.text).toContain("[discord]");
    expect(result.text).toContain("hey there");
    expect(result.text).toContain("hello!");
    expect(result.text).toContain(
      "Shaw (discord username: shawmakesmagic): hey there",
    );
    expect(result.values).toHaveProperty("recentConversationCount", 2);
  });

  it("limits to 10 messages", async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      roomId: "room-1",
      entityId: "user-1",
      content: { text: `message ${i}` },
      createdAt: Date.now() - i * 10_000,
    }));

    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue(["room-1"]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue(messages),
      getRoom: vi.fn().mockResolvedValue({ id: "room-1", type: "dm" }),
    });

    const result = await recentConversationsProvider.get(
      runtime,
      makeMessage("user-1"),
      {} as never,
    );

    expect(result.values).toHaveProperty("recentConversationCount", 10);
  });

  it("has correct metadata", () => {
    expect(recentConversationsProvider.name).toBe("recent-conversations");
    expect(recentConversationsProvider.dynamic).toBe(true);
    expect(recentConversationsProvider.position).toBe(5);
  });
});
