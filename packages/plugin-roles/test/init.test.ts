import { describe, expect, it, vi } from "vitest";
import rolesPlugin from "../src/index";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import type { IAgentRuntime, UUID } from "@elizaos/core";

type MockWorld = { id: string; metadata: RolesWorldMetadata };
type MockRoom = { id: string; worldId: string | null };
type MockEntity = {
  id: string;
  names: string[];
  metadata: Record<string, Record<string, string>>;
};

function createInitRuntime(opts: {
  worlds: MockWorld[];
  worldRooms?: Record<string, MockRoom[]>;
  roomEntities?: Record<string, MockEntity[]>;
}): IAgentRuntime {
  return {
    getAllWorlds: vi.fn().mockResolvedValue(opts.worlds),

    getWorld: vi.fn().mockImplementation(async (id: string) => {
      return opts.worlds.find((w) => w.id === id) ?? null;
    }),

    updateWorld: vi.fn().mockResolvedValue(undefined),

    getRooms: vi.fn().mockImplementation(async (worldId: string) => {
      return opts.worldRooms?.[worldId] ?? [];
    }),

    getEntitiesForRoom: vi.fn().mockImplementation(async (roomId: string) => {
      return opts.roomEntities?.[roomId] ?? [];
    }),
  } as unknown as IAgentRuntime;
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
// ensureOwnerRole
// ═══════════════════════════════════════════════════════════════════════════

describe("ensureOwnerRole via init()", () => {
  it("assigns OWNER role to world owner with no role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" }, roles: {} },
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await rolesPlugin.init!({}, runtime);
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
  });

  it("skips when owner already has OWNER role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" }, roles: { "user-1": "OWNER" } },
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await rolesPlugin.init!({}, runtime);
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips worlds without ownership", async () => {
    const world: MockWorld = { id: "w1", metadata: { roles: {} } };
    const runtime = createInitRuntime({ worlds: [world] });
    await rolesPlugin.init!({}, runtime);
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("initializes roles map when missing", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" } } as RolesWorldMetadata,
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await rolesPlugin.init!({}, runtime);
    expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
  });

  it("processes multiple worlds", async () => {
    const w1: MockWorld = { id: "w1", metadata: { ownership: { ownerId: "u1" }, roles: {} } };
    const w2: MockWorld = { id: "w2", metadata: { ownership: { ownerId: "u2" }, roles: {} } };
    const runtime = createInitRuntime({ worlds: [w1, w2] });
    await rolesPlugin.init!({}, runtime);
    expect(runtime.updateWorld).toHaveBeenCalledTimes(2);
  });

  it("does not crash when getAllWorlds throws", async () => {
    const runtime = {
      getAllWorlds: vi.fn().mockRejectedValue(new Error("DB error")),
      updateWorld: vi.fn(),
    } as unknown as IAgentRuntime;
    await rolesPlugin.init!({}, runtime);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyConnectorAdminWhitelists
// ═══════════════════════════════════════════════════════════════════════════

describe("applyConnectorAdminWhitelists via init()", () => {
  it("promotes whitelisted discord user to ADMIN", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          { id: "dc-user", names: ["Alice"], metadata: { discord: { userId: "123456789" } } },
        ],
      },
    });

    await rolesPlugin.init!({ connectorAdmins: { discord: ["123456789"] } }, runtime);
    expect(world.metadata.roles?.["dc-user"]).toBe("ADMIN");
  });

  it("promotes whitelisted telegram user by username", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          { id: "tg-user", names: ["Bob"], metadata: { telegram: { username: "bob_tg" } } },
        ],
      },
    });

    await rolesPlugin.init!({ connectorAdmins: { telegram: ["bob_tg"] } }, runtime);
    expect(world.metadata.roles?.["tg-user"]).toBe("ADMIN");
  });

  it("skips entities that already have a role", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER", existing: "USER" } },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          { id: "existing", names: ["Existing"], metadata: { discord: { userId: "wl-id" } } },
        ],
      },
    });

    await rolesPlugin.init!({ connectorAdmins: { discord: ["wl-id"] } }, runtime);
    // Should not have updated — entity already has a role
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("skips when whitelist is empty", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await rolesPlugin.init!({ connectorAdmins: { discord: [] } }, runtime);
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("does not match entity to wrong connector", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          { id: "dc-user", names: ["User"], metadata: { discord: { userId: "my-id" } } },
        ],
      },
    });

    // Whitelist is for telegram, not discord
    await rolesPlugin.init!({ connectorAdmins: { telegram: ["my-id"] } }, runtime);
    expect(world.metadata.roles?.["dc-user"]).toBeUndefined();
  });
});
