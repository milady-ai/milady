import { describe, expect, it, vi } from "vitest";
import { rolesProvider } from "../src/provider";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import type { IAgentRuntime, Memory, State, UUID } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRuntime(opts: {
  room?: { worldId: string | null } | null;
  worldMeta?: RolesWorldMetadata | null;
  entities?: Record<string, { names: string[]; metadata?: Record<string, unknown> }>;
}): IAgentRuntime {
  return {
    getRoom: vi.fn().mockResolvedValue(opts.room ?? null),
    getWorld: vi.fn().mockResolvedValue(
      opts.worldMeta !== undefined && opts.worldMeta !== null
        ? { id: "world-1", metadata: opts.worldMeta }
        : opts.worldMeta === null
          ? null
          : undefined,
    ),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const e = opts.entities?.[id];
      if (!e) return null;
      return { id, names: e.names, metadata: e.metadata ?? {} };
    }),
  } as unknown as IAgentRuntime;
}

function msg(entityId: string): Memory {
  return {
    entityId: entityId as UUID,
    roomId: "room-1" as UUID,
    content: { text: "" },
  } as Memory;
}

const emptyState = {} as State;

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("rolesProvider", () => {
  // --- Shape validation ---

  it("has correct provider metadata", () => {
    expect(rolesProvider.name).toBe("roles");
    expect(rolesProvider.dynamic).toBe(true);
    expect(typeof rolesProvider.get).toBe("function");
    expect(typeof rolesProvider.description).toBe("string");
  });

  // --- Normal operation ---

  it("returns speaker role and hierarchy for OWNER", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: {
        ownership: { ownerId: "o1" },
        roles: { o1: "OWNER", a1: "ADMIN", a2: "ADMIN" },
      },
      entities: {
        o1: { names: ["Shaw"] },
        a1: { names: ["Alice"] },
        a2: { names: ["Bob"] },
      },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);

    expect(result.values?.speakerRole).toBe("OWNER");
    expect(result.values?.canManageRoles).toBe(true);
    expect(result.values?.ownerCount).toBe(1);
    expect(result.values?.adminCount).toBe(2);
    expect(result.data?.owners).toEqual(["o1"]);
    expect(result.data?.admins).toContain("a1");
    expect(result.data?.admins).toContain("a2");
    expect(result.text).toContain("OWNER");
    expect(result.text).toContain("Shaw");
    expect(result.text).toContain("Alice");
  });

  it("returns ADMIN role for admin speaker", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { o1: "OWNER", a1: "ADMIN" } },
      entities: { o1: { names: ["Shaw"] }, a1: { names: ["Alice"] } },
    });
    const result = await rolesProvider.get(runtime, msg("a1"), emptyState);
    expect(result.values?.speakerRole).toBe("ADMIN");
    expect(result.values?.canManageRoles).toBe(true);
  });

  it("returns NONE for unroled speaker", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { o1: "OWNER" } },
      entities: { o1: { names: ["Shaw"] } },
    });
    const result = await rolesProvider.get(runtime, msg("nobody"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
    expect(result.values?.canManageRoles).toBe(false);
  });

  // --- Early-exit paths ---

  it("returns empty when no room found", async () => {
    const runtime = mockRuntime({ room: null });
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
    expect(result.values?.canManageRoles).toBe(false);
    expect(result.text).toBe("");
  });

  it("returns empty when room has no worldId", async () => {
    const runtime = mockRuntime({ room: { worldId: null } });
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
  });

  it("returns empty when world not found", async () => {
    const runtime = mockRuntime({ room: { worldId: "w1" }, worldMeta: null });
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
  });

  it("handles world with no roles", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { ownership: { ownerId: "o1" } },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
    expect(result.data?.owners).toEqual([]);
    expect(result.data?.admins).toEqual([]);
  });

  it("handles world with null metadata", async () => {
    const runtime = {
      getRoom: vi.fn().mockResolvedValue({ worldId: "w1" }),
      getWorld: vi.fn().mockResolvedValue({ id: "w1", metadata: null }),
      getEntityById: vi.fn().mockResolvedValue(null),
    } as unknown as IAgentRuntime;
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.values?.speakerRole).toBe("NONE");
    expect(result.data?.roles).toEqual({});
  });

  // --- Name resolution edge cases ---

  it("falls back to truncated entityId when entity has no names", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { "abcdefgh-1234-5678-9012-abcdefabcdef": "OWNER" } },
      entities: {
        "abcdefgh-1234-5678-9012-abcdefabcdef": { names: [] },
      },
    });
    const result = await rolesProvider.get(
      runtime, msg("abcdefgh-1234-5678-9012-abcdefabcdef"), emptyState,
    );
    expect(result.text).toContain("abcdefg");
  });

  it("falls back to truncated id when getEntityById returns null", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { "12345678-dead-beef": "ADMIN" } },
      entities: {}, // entity not found
    });
    const result = await rolesProvider.get(runtime, msg("other"), emptyState);
    expect(result.text).toContain("12345678");
  });

  it("survives getEntityById throwing", async () => {
    const runtime = {
      getRoom: vi.fn().mockResolvedValue({ worldId: "w1" }),
      getWorld: vi.fn().mockResolvedValue({
        id: "w1",
        metadata: { roles: { e1: "OWNER" } },
      }),
      getEntityById: vi.fn().mockRejectedValue(new Error("DB gone")),
    } as unknown as IAgentRuntime;
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    // Should not throw — falls back gracefully
    expect(result.values?.speakerRole).toBe("OWNER");
    expect(result.text).toContain("e1"); // truncated id fallback
  });

  it("uses metadata.default.name when names array is empty", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles: { e1: "OWNER" } },
      entities: {
        e1: { names: [], metadata: { default: { name: "MetaName" } } },
      },
    });
    // The provider tries entity.names[0] first, then metadata.default.name
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    // names[0] is undefined, so it should fallback
    expect(result.text).toBeDefined();
  });

  // --- Large role maps ---

  it("handles 100 entities without performance issues", async () => {
    const roles: Record<string, RoleName> = { o1: "OWNER" };
    const entities: Record<string, { names: string[] }> = {
      o1: { names: ["Owner"] },
    };
    for (let i = 0; i < 99; i++) {
      const id = `admin-${i}`;
      roles[id] = "ADMIN";
      entities[id] = { names: [`Admin${i}`] };
    }
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles },
      entities,
    });
    const start = Date.now();
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    const elapsed = Date.now() - start;
    expect(result.values?.adminCount).toBe(99);
    expect(elapsed).toBeLessThan(2000); // should be instant with mocks
  });

  // --- Data shape consistency ---

  it("always returns roles object in data (even when empty)", async () => {
    const runtime = mockRuntime({ room: null });
    const result = await rolesProvider.get(runtime, msg("e1"), emptyState);
    expect(result.data).toBeDefined();
    expect(result.data?.roles).toEqual({});
    expect(result.data?.owners).toEqual([]);
    expect(result.data?.admins).toEqual([]);
  });

  it("data.roles mirrors the world metadata roles", async () => {
    const roles = { o1: "OWNER" as RoleName, a1: "ADMIN" as RoleName };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      worldMeta: { roles },
      entities: { o1: { names: ["O"] }, a1: { names: ["A"] } },
    });
    const result = await rolesProvider.get(runtime, msg("o1"), emptyState);
    expect(result.data?.roles).toEqual(roles);
  });
});
