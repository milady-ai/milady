import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import rolesPlugin from "../src/index";
import type { RolesWorldMetadata } from "../src/types";

type MockWorld = { id: string; metadata: RolesWorldMetadata };
type MockRoom = { id: string; worldId: string | null };
type MockEntity = {
  id: string;
  names: string[];
  metadata: Record<string, Record<string, string>>;
};

function getPluginInit() {
  expect(typeof rolesPlugin.init).toBe("function");
  return rolesPlugin.init;
}

async function advanceTimersAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

function createInitRuntime(opts: {
  worlds: MockWorld[];
  worldRooms?: Record<string, MockRoom[]>;
  roomEntities?: Record<string, MockEntity[]>;
  settings?: Record<string, string | boolean | number | null>;
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

    getSetting: vi.fn().mockImplementation((key: string) => {
      return opts.settings?.[key] ?? null;
    }),
  } as unknown as IAgentRuntime;
}

// ═══════════════════════════════════════════════════════════════════════════
// Plugin shape
// ═══════════════════════════════════════════════════════════════════════════

describe("plugin shape", () => {
  it("has correct name", () => {
    expect(rolesPlugin.name).toBe("roles");
  });
  it("has a provider", () => {
    expect(rolesPlugin.providers).toHaveLength(1);
    expect(rolesPlugin.providers?.[0]?.name).toBe("roles");
  });
  it("has an action", () => {
    expect(rolesPlugin.actions).toHaveLength(1);
    expect(rolesPlugin.actions?.[0]?.name).toBe("UPDATE_ROLE");
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
    await getPluginInit()?.({}, runtime);
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
    const runtime = createInitRuntime({ worlds: [world] });
    await getPluginInit()?.({}, runtime);
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(world.metadata.roleSources?.["user-1"]).toBe("owner");
  });

  it("skips worlds without ownership", async () => {
    const world: MockWorld = { id: "w1", metadata: { roles: {} } };
    const runtime = createInitRuntime({ worlds: [world] });
    await getPluginInit()?.({}, runtime);
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("initializes roles map when missing", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "user-1" } } as RolesWorldMetadata,
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await getPluginInit()?.({}, runtime);
    expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
  });

  it("processes multiple worlds", async () => {
    const w1: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "u1" }, roles: {} },
    };
    const w2: MockWorld = {
      id: "w2",
      metadata: { ownership: { ownerId: "u2" }, roles: {} },
    };
    const runtime = createInitRuntime({ worlds: [w1, w2] });
    await getPluginInit()?.({}, runtime);
    expect(runtime.updateWorld).toHaveBeenCalledTimes(2);
  });

  it("rewrites connector-local world ownership to the configured canonical owner", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: {
        ownership: { ownerId: "discord-guild-owner" },
        roles: { "discord-guild-owner": "OWNER" },
      },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-canonical",
      },
    });

    await getPluginInit()?.({}, runtime);

    expect(world.metadata.ownership?.ownerId).toBe("owner-canonical");
    expect(world.metadata.roles?.["owner-canonical"]).toBe("OWNER");
    expect(world.metadata.roles?.["discord-guild-owner"]).toBeUndefined();
  });

  it("does not crash when getAllWorlds throws", async () => {
    const runtime = {
      getAllWorlds: vi.fn().mockRejectedValue(new Error("DB error")),
      updateWorld: vi.fn(),
    } as unknown as IAgentRuntime;
    await getPluginInit()?.({}, runtime);
  });

  it("retries owner bootstrap until worlds become available", async () => {
    vi.useFakeTimers();
    try {
      const world: MockWorld = {
        id: "w1",
        metadata: { ownership: { ownerId: "user-1" }, roles: {} },
      };
      const getAllWorlds = vi
        .fn()
        .mockRejectedValueOnce(new Error("not ready"))
        .mockResolvedValue([world]);
      const runtime = {
        getAllWorlds,
        getWorld: vi.fn().mockResolvedValue(world),
        updateWorld: vi.fn().mockResolvedValue(undefined),
      } as unknown as IAgentRuntime;

      await getPluginInit()?.({}, runtime);
      expect(runtime.updateWorld).not.toHaveBeenCalled();

      await advanceTimersAndFlush(1_500);

      expect(getAllWorlds).toHaveBeenCalledTimes(2);
      expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
      expect(world.metadata.roles?.["user-1"]).toBe("OWNER");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying owner bootstrap after the bounded retry budget", async () => {
    vi.useFakeTimers();
    try {
      const getAllWorlds = vi
        .fn()
        .mockRejectedValue(new Error("still not ready"));
      const runtime = {
        getAllWorlds,
        updateWorld: vi.fn().mockResolvedValue(undefined),
      } as unknown as IAgentRuntime;

      await getPluginInit()?.({}, runtime);
      await advanceTimersAndFlush(1_500);
      await advanceTimersAndFlush(5_000);
      await advanceTimersAndFlush(15_000);
      await advanceTimersAndFlush(60_000);

      expect(getAllWorlds).toHaveBeenCalledTimes(4);
      expect(runtime.updateWorld).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyConnectorAdminWhitelists
// ═══════════════════════════════════════════════════════════════════════════

describe("applyConnectorAdminWhitelists via init()", () => {
  it("loads connectorAdmins from runtime settings when init config is empty", async () => {
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
          {
            id: "dc-user",
            names: ["Alice"],
            metadata: { discord: { userId: "123456789" } },
          },
        ],
      },
      settings: {
        ELIZA_ROLES_CONNECTOR_ADMINS_JSON: JSON.stringify({
          discord: ["123456789"],
        }),
      },
    });

    await getPluginInit()?.({}, runtime);
    expect(world.metadata.roles?.["dc-user"]).toBe("ADMIN");
    expect(world.metadata.roleSources?.["dc-user"]).toBe("connector_admin");
  });

  it("ignores malformed connectorAdmins runtime settings gracefully", async () => {
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
          {
            id: "dc-user",
            names: ["Alice"],
            metadata: { discord: { userId: "123456789" } },
          },
        ],
      },
      settings: {
        ELIZA_ROLES_CONNECTOR_ADMINS_JSON: "{not-json",
      },
    });

    await expect(getPluginInit()?.({}, runtime)).resolves.toBeUndefined();
    expect(world.metadata.roles?.["dc-user"]).toBeUndefined();
  });

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
          {
            id: "dc-user",
            names: ["Alice"],
            metadata: { discord: { userId: "123456789" } },
          },
        ],
      },
    });

    await getPluginInit()?.(
      { connectorAdmins: { discord: ["123456789"] } },
      runtime,
    );
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
          {
            id: "tg-user",
            names: ["Bob"],
            metadata: { telegram: { username: "bob_tg" } },
          },
        ],
      },
    });

    await getPluginInit()?.(
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
        roles: { o1: "OWNER", existing: "USER" },
      },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          {
            id: "existing",
            names: ["Existing"],
            metadata: { discord: { userId: "wl-id" } },
          },
        ],
      },
    });

    await getPluginInit()?.(
      { connectorAdmins: { discord: ["wl-id"] } },
      runtime,
    );
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(world.metadata.roles?.existing).toBe("USER");
    expect(world.metadata.roleSources?.existing).toBeUndefined();
    expect(world.metadata.roleSources?.o1).toBe("owner");
  });

  it("skips when whitelist is empty", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: { ownership: { ownerId: "o1" }, roles: { o1: "OWNER" } },
    };
    const runtime = createInitRuntime({ worlds: [world] });
    await getPluginInit()?.({ connectorAdmins: { discord: [] } }, runtime);
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(world.metadata.roleSources?.o1).toBe("owner");
  });

  it("removes stale connector_admin grants when whitelist is empty", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: {
        ownership: { ownerId: "o1" },
        roles: { o1: "OWNER", stale: "ADMIN" },
        roleSources: { o1: "owner", stale: "connector_admin" },
      },
    };
    const runtime = createInitRuntime({ worlds: [world] });

    await getPluginInit()?.({}, runtime);

    expect(world.metadata.roles?.stale).toBeUndefined();
    expect(world.metadata.roleSources?.stale).toBeUndefined();
  });

  it("reconciles connector_admin grants when the whitelist changes", async () => {
    const world: MockWorld = {
      id: "w1",
      metadata: {
        ownership: { ownerId: "o1" },
        roles: { o1: "OWNER", stale: "ADMIN" },
        roleSources: { o1: "owner", stale: "connector_admin" },
      },
    };
    const runtime = createInitRuntime({
      worlds: [world],
      worldRooms: { w1: [{ id: "r1", worldId: "w1" }] },
      roomEntities: {
        r1: [
          { id: "o1", names: ["Shaw"], metadata: {} },
          {
            id: "fresh",
            names: ["Fresh"],
            metadata: { discord: { userId: "fresh-admin" } },
          },
        ],
      },
    });

    await getPluginInit()?.(
      { connectorAdmins: { discord: ["fresh-admin"] } },
      runtime,
    );

    expect(world.metadata.roles?.stale).toBeUndefined();
    expect(world.metadata.roleSources?.stale).toBeUndefined();
    expect(world.metadata.roles?.fresh).toBe("ADMIN");
    expect(world.metadata.roleSources?.fresh).toBe("connector_admin");
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
          {
            id: "dc-user",
            names: ["User"],
            metadata: { discord: { userId: "my-id" } },
          },
        ],
      },
    });

    // Whitelist is for telegram, not discord
    await getPluginInit()?.(
      { connectorAdmins: { telegram: ["my-id"] } },
      runtime,
    );
    expect(world.metadata.roles?.["dc-user"]).toBeUndefined();
  });
});
