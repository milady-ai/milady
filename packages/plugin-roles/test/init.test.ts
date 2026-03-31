import { describe, expect, it, vi } from "vitest";
import rolesPlugin from "../src/index";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import type { IAgentRuntime, UUID } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockRoom = { id: string; worldId: string | null };
type MockWorld = { id: string; metadata: RolesWorldMetadata };
type MockEntity = {
  id: string;
  names: string[];
  metadata: Record<string, Record<string, string>>;
};

function createInitRuntime(opts: {
  rooms: MockRoom[];
  worlds: Record<string, MockWorld>;
  entities?: Record<string, MockEntity>;
  roomEntities?: Record<string, string[]>;
}): IAgentRuntime & {
  _updateWorldCalls: MockWorld[];
} {
  const updateWorldCalls: MockWorld[] = [];

  const runtime = {
    _updateWorldCalls: updateWorldCalls,

    getRooms: vi.fn().mockResolvedValue(opts.rooms),

    getWorld: vi.fn().mockImplementation(async (id: string) => {
      return opts.worlds[id] ?? null;
    }),

    updateWorld: vi.fn().mockImplementation(async (world: MockWorld) => {
      updateWorldCalls.push(JSON.parse(JSON.stringify(world)));
    }),

    getEntitiesForRoom: vi.fn().mockImplementation(async (roomId: string) => {
      return (opts.roomEntities?.[roomId] ?? []) as UUID[];
    }),

    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      return opts.entities?.[id] ?? null;
    }),
  } as unknown as IAgentRuntime & { _updateWorldCalls: MockWorld[] };

  return runtime;
}

// ═══════════════════════════════════════════════════════════════════════════
// Plugin shape
// ═══════════════════════════════════════════════════════════════════════════

describe("plugin shape", () => {
  it("has correct name", () => {
    expect(rolesPlugin.name).toBe("@miladyai/plugin-roles");
  });

  it("has a provider", () => {
    expect(rolesPlugin.providers).toHaveLength(1);
    expect(rolesPlugin.providers![0].name).toBe("roles");
  });

  it("has an action", () => {
    expect(rolesPlugin.actions).toHaveLength(1);
    expect(rolesPlugin.actions![0].name).toBe("UPDATE_ROLE");
  });

  it("has an init function", () => {
    expect(typeof rolesPlugin.init).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ensureOwnerRole (called via init)
// ═══════════════════════════════════════════════════════════════════════════

describe("ensureOwnerRole via init()", () => {
  it("assigns OWNER role to world owner who has no role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" }, roles: {} },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!({}, runtime);

    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
  });

  it("skips when owner already has OWNER role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: {
        ownership: { ownerId: "user-1" },
        roles: { "user-1": "OWNER" },
      },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!({}, runtime);

    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips rooms without worldId", async () => {
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: null }],
      worlds: {},
    });

    await rolesPlugin.init!({}, runtime);

    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips worlds without ownership", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { roles: {} },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!({}, runtime);

    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("initializes roles map when missing", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" } } as RolesWorldMetadata,
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!({}, runtime);

    expect(world.metadata.roles).toBeDefined();
    expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
  });

  it("processes multiple worlds (deduplicates by worldId)", async () => {
    const w1: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "u1" }, roles: {} },
    };
    const w2: MockWorld = {
      id: "w2",
      metadata: { ownership: { ownerId: "u2" }, roles: {} },
    };
    const runtime = createInitRuntime({
      rooms: [
        { id: "r1", worldId: "w1" },
        { id: "r2", worldId: "w1" }, // duplicate world
        { id: "r3", worldId: "w2" },
      ],
      worlds: { w1, w2 },
    });

    await rolesPlugin.init!({}, runtime);

    // Should update w1 and w2 once each (not twice for w1)
    expect(runtime.updateWorld).toHaveBeenCalledTimes(2);
  });

  it("does not crash when getRooms throws", async () => {
    const runtime = {
      getRooms: vi.fn().mockRejectedValue(new Error("DB error")),
      updateWorld: vi.fn(),
    } as unknown as IAgentRuntime;

    // Should not throw
    await rolesPlugin.init!({}, runtime);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyConnectorAdminWhitelists (called via init with config)
// ═══════════════════════════════════════════════════════════════════════════

describe("applyConnectorAdminWhitelists via init()", () => {
  it("promotes whitelisted discord user to ADMIN", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "owner-1" }, roles: { "owner-1": "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["owner-1", "discord-user"] },
      entities: {
        "owner-1": { id: "owner-1", names: ["Shaw"], metadata: {} },
        "discord-user": {
          id: "discord-user",
          names: ["Alice"],
          metadata: { discord: { userId: "123456789" } },
        },
      },
    });

    await rolesPlugin.init!(
      { connectorAdmins: { discord: ["123456789"] } },
      runtime,
    );

    expect(world.metadata.roles?.["discord-user"]).toBe("ADMIN");
    // updateWorld called: once for ensureOwner (already set), once for whitelist
    // Actually ensureOwner skips since owner already has OWNER role
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
  });

  it("promotes whitelisted telegram user by username", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["o1", "tg-user"] },
      entities: {
        o1: { id: "o1", names: ["Shaw"], metadata: {} },
        "tg-user": {
          id: "tg-user",
          names: ["Bob"],
          metadata: { telegram: { username: "bob_tg" } },
        },
      },
    });

    await rolesPlugin.init!(
      { connectorAdmins: { telegram: ["bob_tg"] } },
      runtime,
    );

    expect(world.metadata.roles?.["tg-user"]).toBe("ADMIN");
  });

  it("skips entities that already have a role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: {
        ownership: { ownerId: "o1" },
        roles: { o1: "OWNER", existing: "ADMIN" },
      },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["o1", "existing"] },
      entities: {
        o1: { id: "o1", names: ["Shaw"], metadata: {} },
        existing: {
          id: "existing",
          names: ["Existing"],
          metadata: { discord: { userId: "whitelisted-id" } },
        },
      },
    });

    await rolesPlugin.init!(
      { connectorAdmins: { discord: ["whitelisted-id"] } },
      runtime,
    );

    // Should not have called updateWorld (no changes)
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips when whitelist is empty", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!(
      { connectorAdmins: { discord: [] } },
      runtime,
    );

    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips when no connectorAdmins in config", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
    });

    await rolesPlugin.init!({}, runtime);

    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("handles multiple connectors in one whitelist", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["o1", "dc", "tg"] },
      entities: {
        o1: { id: "o1", names: ["Shaw"], metadata: {} },
        dc: { id: "dc", names: ["DCUser"], metadata: { discord: { userId: "dc-id" } } },
        tg: { id: "tg", names: ["TGUser"], metadata: { telegram: { id: "tg-id" } } },
      },
    });

    await rolesPlugin.init!(
      { connectorAdmins: { discord: ["dc-id"], telegram: ["tg-id"] } },
      runtime,
    );

    expect(world.metadata.roles?.dc).toBe("ADMIN");
    expect(world.metadata.roles?.tg).toBe("ADMIN");
  });

  it("does not match entity to wrong connector", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["o1", "dc-user"] },
      entities: {
        o1: { id: "o1", names: ["Shaw"], metadata: {} },
        "dc-user": {
          id: "dc-user",
          names: ["User"],
          metadata: { discord: { userId: "my-id" } },
        },
      },
    });

    // Whitelist is for telegram, not discord
    await rolesPlugin.init!(
      { connectorAdmins: { telegram: ["my-id"] } },
      runtime,
    );

    // Should NOT be promoted
    expect(world.metadata.roles?.["dc-user"]).toBeUndefined();
  });

  it("does not crash when entity has no metadata", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      rooms: [{ id: "r1", worldId: "w1" }],
      worlds: { w1: world },
      roomEntities: { r1: ["o1", "no-meta"] },
      entities: {
        o1: { id: "o1", names: ["Shaw"], metadata: {} },
      },
    });
    // no-meta entity won't be found by getEntityById (returns null)

    await rolesPlugin.init!(
      { connectorAdmins: { discord: ["some-id"] } },
      runtime,
    );

    // Should not crash, no updates
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });
});
