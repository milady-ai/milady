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

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    ModelType: { ...actual.ModelType, TEXT_EMBEDDING: "TEXT_EMBEDDING" },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { searchConversationsAction } from "./search-conversations";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    useModel: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    searchMemories: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as never;
}

function makeAdminMessage() {
  return {
    entityId: "owner-1",
    roomId: "room-1",
    content: { text: "search for pizza", source: "client_chat" },
  } as never;
}

describe("searchConversationsAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
  });

  it("has correct metadata", () => {
    expect(searchConversationsAction.name).toBe("SEARCH_CONVERSATIONS");
    expect(searchConversationsAction.parameters?.length).toBeGreaterThan(0);
  });

  it("rejects empty query", async () => {
    const result = (await searchConversationsAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: {} } as never,
    )) as unknown as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.text).toContain("requires a non-empty query");
  });

  it("returns search results with line numbers", async () => {
    const runtime = makeRuntime({
      searchMemories: vi.fn().mockResolvedValue([
        {
          id: "m1",
          roomId: "room-1",
          entityId: "user-1",
          content: { text: "let's order pizza", source: "discord" },
          metadata: {
            entityName: "Shaw",
            entityUserName: "shawmakesmagic",
          },
          createdAt: Date.now() - 60_000,
        },
        {
          id: "m2",
          roomId: "room-2",
          entityId: "agent-1",
          content: { text: "pizza sounds great" },
          createdAt: Date.now() - 30_000,
        },
      ]),
      getRoom: vi.fn().mockImplementation(async (id: string) => ({
        id,
        type: "group",
        name: id === "room-1" ? "food-chat" : "random",
        source: "discord",
      })),
    });

    const result = (await searchConversationsAction.handler?.(
      runtime,
      makeAdminMessage(),
      {} as never,
      { parameters: { query: "pizza" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("pizza");
    expect(result.text).toContain("food-chat");
    expect(result.text).toContain("  1 |");
    expect(result.text).toContain("  2 |");
    expect(result.text).toContain("Shaw (discord username: shawmakesmagic)");
    expect(result.text).toContain("scratchpad");
  });

  it("returns empty when no matches", async () => {
    const result = (await searchConversationsAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: { query: "nonexistent" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("No conversations found");
  });

  it("filters by source platform", async () => {
    const runtime = makeRuntime({
      searchMemories: vi.fn().mockResolvedValue([
        {
          id: "m1",
          roomId: "room-1",
          entityId: "user-1",
          content: { text: "discord message" },
          createdAt: Date.now(),
        },
        {
          id: "m2",
          roomId: "room-2",
          entityId: "user-1",
          content: { text: "telegram message" },
          createdAt: Date.now(),
        },
      ]),
      getRoom: vi.fn().mockImplementation(async (id: string) => ({
        id,
        type: "group",
        name: "test",
        source: id === "room-1" ? "discord" : "telegram",
      })),
    });

    const result = (await searchConversationsAction.handler?.(
      runtime,
      makeAdminMessage(),
      {} as never,
      { parameters: { query: "message", source: "telegram" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("telegram message");
    expect(result.text).not.toContain("discord message");
  });
});
