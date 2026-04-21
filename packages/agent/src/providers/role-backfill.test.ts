import type { Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockHasConfiguredCanonicalOwner,
  mockNormalizeRole,
  mockResolveCanonicalOwnerId,
} = vi.hoisted(() => ({
  mockHasConfiguredCanonicalOwner: vi.fn(),
  mockNormalizeRole: vi.fn(),
  mockResolveCanonicalOwnerId: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  hasConfiguredCanonicalOwner: mockHasConfiguredCanonicalOwner,
  normalizeRole: mockNormalizeRole,
  resolveCanonicalOwnerId: mockResolveCanonicalOwnerId,
}));

import { roleBackfillProvider } from "./role-backfill";

const ENTITY_ID = "entity-aaa" as UUID;
const OWNER_ID = "owner-bbb" as UUID;
const ROOM_ID = "room-ccc" as UUID;
const WORLD_ID = "world-ddd" as UUID;

type MockRuntime = { updateWorld: ReturnType<typeof vi.fn> };

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-eee" as UUID,
    getRoom: vi.fn().mockResolvedValue({
      id: ROOM_ID,
      worldId: WORLD_ID,
    }),
    getWorld: vi.fn().mockResolvedValue({
      id: WORLD_ID,
      metadata: {
        ownership: { ownerId: OWNER_ID },
        roles: {},
      },
    }),
    updateWorld: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: ENTITY_ID,
    roomId: ROOM_ID,
    content: { text: "hello" },
    ...overrides,
  } as Memory;
}

function getUpdateWorld(runtime: unknown): ReturnType<typeof vi.fn> {
  return (runtime as MockRuntime).updateWorld;
}

describe("roleBackfillProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizeRole.mockImplementation((raw: string | undefined | null) => {
      if (!raw) return "NONE";
      return raw.toUpperCase() === "OWNER" ? "OWNER" : "NONE";
    });
    mockHasConfiguredCanonicalOwner.mockReturnValue(false);
    mockResolveCanonicalOwnerId.mockImplementation(
      (_runtime: unknown, metadata?: { ownership?: { ownerId?: string } }) =>
        metadata?.ownership?.ownerId ?? null,
    );
  });

  it("has correct metadata", () => {
    expect(roleBackfillProvider.name).toBe("roleBackfill");
    expect(roleBackfillProvider.dynamic).toBe(true);
    expect(roleBackfillProvider.position).toBe(11);
  });

  it("backfills OWNER role when world owner has no role", async () => {
    const runtime = makeRuntime();

    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
    const updateWorld = getUpdateWorld(runtime);
    expect(updateWorld).toHaveBeenCalledOnce();
    const call = updateWorld.mock.calls[0][0];
    expect(call.metadata.roles[OWNER_ID]).toBe("OWNER");
  });

  it("is a no-op when owner already has OWNER role", async () => {
    mockNormalizeRole.mockReturnValue("OWNER");

    const runtime = makeRuntime({
      getWorld: vi.fn().mockResolvedValue({
        id: WORLD_ID,
        metadata: {
          ownership: { ownerId: OWNER_ID },
          roles: { [OWNER_ID]: "OWNER" },
        },
      }),
    });

    await roleBackfillProvider.get(runtime, makeMessage(), {} as never);

    expect(getUpdateWorld(runtime)).toHaveBeenCalledOnce();
    const call = getUpdateWorld(runtime).mock.calls[0][0];
    expect(call.metadata.roles[OWNER_ID]).toBe("OWNER");
    expect(call.metadata.roleSources[OWNER_ID]).toBe("owner");
  });

  it("returns empty when room has no worldId", async () => {
    const runtime = makeRuntime({
      getRoom: vi.fn().mockResolvedValue({ id: ROOM_ID, worldId: null }),
    });

    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
    expect(getUpdateWorld(runtime)).not.toHaveBeenCalled();
  });

  it("returns empty when world has no ownerId", async () => {
    const runtime = makeRuntime({
      getWorld: vi.fn().mockResolvedValue({
        id: WORLD_ID,
        metadata: { ownership: {} },
      }),
    });

    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
    expect(getUpdateWorld(runtime)).not.toHaveBeenCalled();
  });

  it("returns empty when world is not found", async () => {
    const runtime = makeRuntime({
      getWorld: vi.fn().mockResolvedValue(null),
    });

    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
  });

  it("handles updateWorld failure gracefully", async () => {
    const runtime = makeRuntime({
      updateWorld: vi.fn().mockRejectedValue(new Error("db error")),
    });

    // Should not throw
    const result = await roleBackfillProvider.get(
      runtime,
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
  });

  it("preserves existing roles when backfilling", async () => {
    const existingRoles = { "other-entity": "ADMIN" };
    const runtime = makeRuntime({
      getWorld: vi.fn().mockResolvedValue({
        id: WORLD_ID,
        metadata: {
          ownership: { ownerId: OWNER_ID },
          roles: { ...existingRoles },
        },
      }),
    });

    await roleBackfillProvider.get(runtime, makeMessage(), {} as never);

    const updateWorld = getUpdateWorld(runtime);
    expect(updateWorld).toHaveBeenCalledOnce();
    const call = updateWorld.mock.calls[0][0];
    expect(call.metadata.roles["other-entity"]).toBe("ADMIN");
    expect(call.metadata.roles[OWNER_ID]).toBe("OWNER");
  });

  it("rewrites connector-local ownership to the configured canonical owner", async () => {
    mockHasConfiguredCanonicalOwner.mockReturnValue(true);
    mockResolveCanonicalOwnerId.mockReturnValue("owner-canonical");

    const runtime = makeRuntime({
      getWorld: vi.fn().mockResolvedValue({
        id: WORLD_ID,
        metadata: {
          ownership: { ownerId: "discord-guild-owner" },
          roles: { "discord-guild-owner": "OWNER" },
        },
      }),
    });

    await roleBackfillProvider.get(runtime, makeMessage(), {} as never);

    const updateWorld = getUpdateWorld(runtime);
    expect(updateWorld).toHaveBeenCalledOnce();
    const call = updateWorld.mock.calls[0][0];
    expect(call.metadata.ownership.ownerId).toBe("owner-canonical");
    expect(call.metadata.roles["owner-canonical"]).toBe("OWNER");
    expect(call.metadata.roles["discord-guild-owner"]).toBeUndefined();
  });
});
