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
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { readChannelAction } from "./read-channel";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getRoom: vi.fn().mockResolvedValue(null),
    getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    getMemories: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as never;
}

function makeAdminMessage() {
  return {
    entityId: "owner-1",
    roomId: "room-1",
    content: { text: "read channel", source: "client_chat" },
  } as never;
}

describe("readChannelAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    // Grant admin access
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
  });

  it("has correct metadata", () => {
    expect(readChannelAction.name).toBe("READ_CHANNEL");
    expect(readChannelAction.parameters).toBeDefined();
    expect(readChannelAction.parameters?.length).toBeGreaterThan(0);
  });

  it("rejects when no channel param", async () => {
    const runtime = makeRuntime();
    const result = await readChannelAction.handler?.(
      runtime,
      makeAdminMessage(),
      {} as never,
      { parameters: {} } as never,
    );
    expect(result).toBeDefined();
    expect((result as unknown as Record<string, unknown>).success).toBe(false);
    expect((result as unknown as Record<string, unknown>).text).toContain("requires a channel");
  });

  it("returns channel not found for unknown channel", async () => {
    const runtime = makeRuntime();
    const result = await readChannelAction.handler?.(
      runtime,
      makeAdminMessage(),
      {} as never,
      { parameters: { channel: "nonexistent" } } as never,
    );
    expect(result).toBeDefined();
    expect((result as unknown as Record<string, unknown>).success).toBe(false);
    expect((result as unknown as Record<string, unknown>).text).toContain("Could not find");
  });

  it("reads messages from a channel by room ID", async () => {
    const runtime = makeRuntime({
      getRoom: vi.fn().mockResolvedValue({
        id: "room-123",
        type: "group",
        name: "general",
        source: "discord",
      }),
      getMemories: vi.fn().mockResolvedValue([
        {
          id: "m1",
          roomId: "room-123",
          entityId: "user-1",
          content: { text: "hello world", source: "discord" },
          metadata: {
            entityName: "Shaw",
            entityUserName: "shawmakesmagic",
          },
          createdAt: Date.now() - 60_000,
        },
        {
          id: "m2",
          roomId: "room-123",
          entityId: "agent-1",
          content: { text: "hi there" },
          createdAt: Date.now() - 30_000,
        },
      ]),
    });

    const result = (await readChannelAction.handler?.(
      runtime,
      makeAdminMessage(),
      {} as never,
      { parameters: { channel: "room-123" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("general");
    expect(result.text).toContain("hello world");
    expect(result.text).toContain("hi there");
    expect(result.text).toContain("Shaw (discord username: shawmakesmagic)");
    expect(result.text).toContain("scratchpad");
    // Line numbers present
    expect(result.text).toContain("  1 |");
    expect(result.text).toContain("  2 |");
  });

  it("denies non-admin access", async () => {
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("other-user");
    mockCheckSenderRole.mockResolvedValue(null);

    const runtime = makeRuntime();
    const result = (await readChannelAction.handler?.(
      runtime,
      { entityId: "random-user", roomId: "r", content: {} } as never,
      {} as never,
      { parameters: { channel: "c" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.text).toContain("Permission denied");
  });
});
