import {
  createUniqueUuid,
  type IAgentRuntime,
  type Memory,
  type Relationship,
  type UUID,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import { ROLE_RANK } from "../src/types";
import {
  canModifyRole,
  checkSenderPrivateAccess,
  checkSenderRole,
  getConfiguredOwnerEntityIds,
  getEntityRole,
  getLiveEntityMetadataFromMessage,
  hasConfiguredCanonicalOwner,
  matchEntityToConnectorAdminWhitelist,
  normalizeRole,
  resolveCanonicalOwnerId,
  resolveCanonicalOwnerIdForMessage,
  resolveEntityRole,
  resolveWorldForMessage,
  setConnectorAdminWhitelist,
  setEntityRole,
} from "../src/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRuntime(opts: {
  room?: { worldId: string | null } | null;
  world?: { id: string; metadata: RolesWorldMetadata | null } | null;
  updateWorld?: ReturnType<typeof vi.fn>;
  entities?: Record<
    string,
    { names?: string[]; metadata?: Record<string, unknown> }
  >;
  relationships?: Relationship[];
  settings?: Record<string, string | boolean | number | null>;
}): IAgentRuntime {
  const settingsStore = { ...(opts.settings ?? {}) };
  return {
    getRoom: vi.fn().mockResolvedValue(opts.room ?? null),
    getWorld: vi.fn().mockResolvedValue(opts.world ?? null),
    updateWorld: opts.updateWorld ?? vi.fn().mockResolvedValue(undefined),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const entity = opts.entities?.[id];
      if (!entity) return null;
      return {
        id,
        names: entity.names ?? [],
        metadata: entity.metadata ?? {},
      };
    }),
    getRelationships: vi.fn().mockResolvedValue(opts.relationships ?? []),
    getSetting: vi.fn().mockImplementation((key: string) => {
      return settingsStore[key] ?? null;
    }),
    setSetting: vi.fn().mockImplementation((key: string, value: unknown) => {
      if (value === null || value === undefined) {
        delete settingsStore[key];
        return;
      }
      settingsStore[key] = value as string | boolean | number | null;
    }),
  } as unknown as IAgentRuntime;
}

function msg(
  entityId: string,
  roomId = "room-1",
  metadata?: Record<string, unknown>,
  memoryMetadata?: Record<string, unknown>,
): Memory {
  return {
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    content: {
      text: "",
      source:
        typeof memoryMetadata?.discordServerId === "string" ||
        typeof memoryMetadata?.discordChannelId === "string"
          ? "discord"
          : undefined,
      ...(metadata ? { metadata } : {}),
    },
    ...(memoryMetadata ? { metadata: memoryMetadata } : {}),
  } as Memory;
}

// ═══════════════════════════════════════════════════════════════════════════
// normalizeRole
// ═══════════════════════════════════════════════════════════════════════════

describe("normalizeRole", () => {
  it("normalizes OWNER case-insensitively", () => {
    expect(normalizeRole("OWNER")).toBe("OWNER");
    expect(normalizeRole("owner")).toBe("OWNER");
    expect(normalizeRole("Owner")).toBe("OWNER");
  });

  it("normalizes ADMIN case-insensitively", () => {
    expect(normalizeRole("ADMIN")).toBe("ADMIN");
    expect(normalizeRole("admin")).toBe("ADMIN");
  });

  it("normalizes USER case-insensitively", () => {
    expect(normalizeRole("USER")).toBe("USER");
    expect(normalizeRole("user")).toBe("USER");
    expect(normalizeRole("User")).toBe("USER");
  });

  it("returns GUEST for anything else", () => {
    for (const val of [
      "GUEST",
      "guest",
      "MEMBER",
      "moderator",
      "NONE",
      "none",
      "UNKNOWN",
      "",
      " ",
      "  ADMIN  ",
      "root",
    ]) {
      expect(normalizeRole(val)).toBe("GUEST");
    }
  });

  it("returns GUEST for nullish values", () => {
    expect(normalizeRole(undefined)).toBe("GUEST");
    expect(normalizeRole(null)).toBe("GUEST");
  });

  it("fuzz: never returns invalid role names", () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzADMINOWNERUSERGUEST0123456789!@#$%^&*() ";
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(Math.random() * 20);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += chars[Math.floor(Math.random() * chars.length)];
      }
      const result = normalizeRole(s);
      expect(["OWNER", "ADMIN", "USER", "GUEST"]).toContain(result);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLE_RANK
// ═══════════════════════════════════════════════════════════════════════════

describe("ROLE_RANK", () => {
  it("OWNER > ADMIN > USER > GUEST", () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.USER);
    expect(ROLE_RANK.USER).toBeGreaterThan(ROLE_RANK.GUEST);
  });

  it("covers all RoleName values", () => {
    const roles: RoleName[] = ["OWNER", "ADMIN", "USER", "GUEST"];
    for (const r of roles) {
      expect(typeof ROLE_RANK[r]).toBe("number");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getEntityRole
// ═══════════════════════════════════════════════════════════════════════════

describe("getEntityRole", () => {
  it("returns the role for a known entity", () => {
    const meta: RolesWorldMetadata = {
      roles: { e1: "OWNER", e2: "ADMIN", e3: "USER", e4: "GUEST" },
    };
    expect(getEntityRole(meta, "e1")).toBe("OWNER");
    expect(getEntityRole(meta, "e2")).toBe("ADMIN");
    expect(getEntityRole(meta, "e3")).toBe("USER");
    expect(getEntityRole(meta, "e4")).toBe("GUEST");
  });

  it("returns GUEST for unknown entities", () => {
    expect(getEntityRole({ roles: { x: "OWNER" } }, "y")).toBe("GUEST");
  });

  it("returns GUEST when metadata is undefined", () => {
    expect(getEntityRole(undefined, "e1")).toBe("GUEST");
  });

  it("returns GUEST when roles map is missing", () => {
    expect(getEntityRole({}, "e1")).toBe("GUEST");
  });

  it("normalizes stored role values", () => {
    const meta = { roles: { e1: "owner" as RoleName } };
    expect(getEntityRole(meta, "e1")).toBe("OWNER");
  });
});

describe("matchEntityToConnectorAdminWhitelist", () => {
  it("matches Discord user ids from entity metadata", () => {
    expect(
      matchEntityToConnectorAdminWhitelist(
        { discord: { userId: "123456789" } },
        { discord: ["123456789"] },
      ),
    ).toEqual({
      connector: "discord",
      matchedField: "userId",
      matchedValue: "123456789",
    });
  });

  it("returns null when the connector does not match", () => {
    expect(
      matchEntityToConnectorAdminWhitelist(
        { discord: { userId: "123456789" } },
        { telegram: ["123456789"] },
      ),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// canModifyRole — exhaustive 4×4×4 matrix (64 combinations)
// ═══════════════════════════════════════════════════════════════════════════

describe("canModifyRole", () => {
  const ALL_ROLES: RoleName[] = ["OWNER", "ADMIN", "USER", "GUEST"];

  // Build the exhaustive truth table
  const expected: Record<string, boolean> = {
    // OWNER can do everything except no-op same→same
    "OWNER:OWNER→OWNER": false,
    "OWNER:OWNER→ADMIN": true,
    "OWNER:OWNER→USER": true,
    "OWNER:OWNER→GUEST": true,
    "OWNER:ADMIN→OWNER": true,
    "OWNER:ADMIN→ADMIN": false,
    "OWNER:ADMIN→USER": true,
    "OWNER:ADMIN→GUEST": true,
    "OWNER:USER→OWNER": true,
    "OWNER:USER→ADMIN": true,
    "OWNER:USER→USER": false,
    "OWNER:USER→GUEST": true,
    "OWNER:GUEST→OWNER": true,
    "OWNER:GUEST→ADMIN": true,
    "OWNER:GUEST→USER": true,
    "OWNER:GUEST→GUEST": false,

    // ADMIN can modify USER/GUEST targets, assign up to ADMIN, never OWNER
    "ADMIN:OWNER→OWNER": false,
    "ADMIN:OWNER→ADMIN": false,
    "ADMIN:OWNER→USER": false,
    "ADMIN:OWNER→GUEST": false,
    "ADMIN:ADMIN→OWNER": false,
    "ADMIN:ADMIN→ADMIN": false,
    "ADMIN:ADMIN→USER": false,
    "ADMIN:ADMIN→GUEST": false,
    "ADMIN:USER→OWNER": false,
    "ADMIN:USER→ADMIN": true,
    "ADMIN:USER→USER": false,
    "ADMIN:USER→GUEST": true,
    "ADMIN:GUEST→OWNER": false,
    "ADMIN:GUEST→ADMIN": true,
    "ADMIN:GUEST→USER": true,
    "ADMIN:GUEST→GUEST": false,

    // USER cannot modify roles
    "USER:OWNER→OWNER": false,
    "USER:OWNER→ADMIN": false,
    "USER:OWNER→USER": false,
    "USER:OWNER→GUEST": false,
    "USER:ADMIN→OWNER": false,
    "USER:ADMIN→ADMIN": false,
    "USER:ADMIN→USER": false,
    "USER:ADMIN→GUEST": false,
    "USER:USER→OWNER": false,
    "USER:USER→ADMIN": false,
    "USER:USER→USER": false,
    "USER:USER→GUEST": false,
    "USER:GUEST→OWNER": false,
    "USER:GUEST→ADMIN": false,
    "USER:GUEST→USER": false,
    "USER:GUEST→GUEST": false,

    // GUEST cannot modify roles
    "GUEST:OWNER→OWNER": false,
    "GUEST:OWNER→ADMIN": false,
    "GUEST:OWNER→USER": false,
    "GUEST:OWNER→GUEST": false,
    "GUEST:ADMIN→OWNER": false,
    "GUEST:ADMIN→ADMIN": false,
    "GUEST:ADMIN→USER": false,
    "GUEST:ADMIN→GUEST": false,
    "GUEST:USER→OWNER": false,
    "GUEST:USER→ADMIN": false,
    "GUEST:USER→USER": false,
    "GUEST:USER→GUEST": false,
    "GUEST:GUEST→OWNER": false,
    "GUEST:GUEST→ADMIN": false,
    "GUEST:GUEST→USER": false,
    "GUEST:GUEST→GUEST": false,
  };

  for (const actor of ALL_ROLES) {
    for (const target of ALL_ROLES) {
      for (const newRole of ALL_ROLES) {
        const key = `${actor}:${target}→${newRole}`;
        const expect_val = expected[key];
        it(`${key} → ${expect_val}`, () => {
          expect(canModifyRole(actor, target, newRole)).toBe(expect_val);
        });
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveWorldForMessage
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveWorldForMessage", () => {
  it("returns world + metadata for a valid room→world chain", async () => {
    const world = {
      id: "w1",
      metadata: { roles: { e1: "OWNER" as RoleName } },
    };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world });
    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result?.world).toBe(world);
  });

  it("returns null when room not found", async () => {
    expect(
      await resolveWorldForMessage(mockRuntime({ room: null }), msg("e1")),
    ).toBeNull();
  });

  it("returns null when room has no worldId", async () => {
    expect(
      await resolveWorldForMessage(
        mockRuntime({ room: { worldId: null } }),
        msg("e1"),
      ),
    ).toBeNull();
  });

  it("returns null when world not found", async () => {
    expect(
      await resolveWorldForMessage(
        mockRuntime({ room: { worldId: "w1" }, world: null }),
        msg("e1"),
      ),
    ).toBeNull();
  });

  it("returns empty metadata when world has null metadata", async () => {
    const world = { id: "w1", metadata: null };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world });
    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result?.metadata).toEqual({});
  });
});

describe("resolveEntityRole", () => {
  it("resolves a connector-whitelisted Discord entity to ADMIN without mutating world metadata", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const world = { id: "w1", metadata: { roles: {} } as RolesWorldMetadata };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world,
      updateWorld,
      entities: {
        speaker: {
          metadata: {
            discord: { userId: "discord-admin-1", username: "owner" },
          },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-1"] });

    const role = await resolveEntityRole(
      runtime,
      world,
      world.metadata,
      "speaker",
    );
    expect(role).toBe("ADMIN");
    expect(world.metadata.roles?.speaker).toBeUndefined();
    expect(updateWorld).not.toHaveBeenCalled();
  });

  it("revalidates connector-admin matches against entity metadata on each lookup", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
      entities: {
        speaker: {
          metadata: { discord: { userId: "discord-admin-1" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-1"] });

    await resolveEntityRole(
      runtime,
      { id: "w1", metadata: { roles: {} } },
      { roles: {} },
      "speaker",
    );
    await resolveEntityRole(
      runtime,
      { id: "w1", metadata: { roles: {} } },
      { roles: {} },
      "speaker",
    );

    expect(runtime.getEntityById).toHaveBeenCalledTimes(2);
  });

  it("drops username-only whitelist matches after the username changes", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
      entities: {
        speaker: {
          metadata: { telegram: { username: "tg_alice" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { telegram: ["tg_alice"] });

    await expect(
      resolveEntityRole(
        runtime,
        { id: "w1", metadata: { roles: {} } },
        { roles: {} },
        "speaker",
      ),
    ).resolves.toBe("ADMIN");

    runtime.getEntityById = vi.fn().mockResolvedValue({
      id: "speaker",
      metadata: { telegram: { username: "tg_bob" } },
    }) as unknown as IAgentRuntime["getEntityById"];

    await expect(
      resolveEntityRole(
        runtime,
        { id: "w1", metadata: { roles: {} } },
        { roles: {} },
        "speaker",
      ),
    ).resolves.toBe("GUEST");
  });

  it("does not honor stale connector_admin grants after whitelist removal", async () => {
    const world = {
      id: "w1",
      metadata: {
        roles: { helper: "ADMIN" },
        roleSources: { helper: "connector_admin" },
      } as RolesWorldMetadata,
    };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world,
      entities: {
        helper: {
          metadata: { discord: { userId: "discord-admin-1" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-1"] });

    await expect(
      resolveEntityRole(runtime, world, world.metadata, "helper"),
    ).resolves.toBe("ADMIN");

    setConnectorAdminWhitelist(runtime, undefined);

    await expect(
      resolveEntityRole(runtime, world, world.metadata, "helper"),
    ).resolves.toBe("GUEST");
  });
});

describe("resolveEntityRole", () => {
  it("prefers live bridge sender metadata when no persisted entity metadata exists", async () => {
    const world = { id: "w1", metadata: { roles: {} } as RolesWorldMetadata };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world,
      entities: {
        speaker: {
          metadata: {},
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-2"] });

    const role = await resolveEntityRole(
      runtime,
      world,
      world.metadata,
      "speaker",
      {
        liveEntityMetadata: {
          discord: { userId: "discord-admin-2", username: "owner" },
        },
      },
    );

    expect(role).toBe("ADMIN");
    expect(world.metadata.roles?.speaker).toBeUndefined();
  });
});

describe("getLiveEntityMetadataFromMessage", () => {
  it("ignores bridge sender metadata embedded in content metadata", () => {
    expect(
      getLiveEntityMetadataFromMessage(
        msg("speaker", "room-1", {
          bridgeSender: {
            id: "discord-user-1",
            metadata: {
              discord: { userId: "discord-user-1", username: "owner" },
            },
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("returns undefined when bridge sender metadata is absent", () => {
    expect(getLiveEntityMetadataFromMessage(msg("speaker"))).toBeUndefined();
  });

  it("extracts native Discord sender metadata from memory metadata", () => {
    expect(
      getLiveEntityMetadataFromMessage(
        msg("speaker", "room-1", undefined, {
          fromId: "discord-owner-111",
          discordServerId: "guild-1",
          entityName: "Shaw",
        }),
      ),
    ).toEqual({
      discord: {
        userId: "discord-owner-111",
        id: "discord-owner-111",
        name: "Shaw",
        username: "Shaw",
      },
    });
  });
});

describe("canonical owner settings", () => {
  it("collects the configured adminEntityId and owner contact entity ids", () => {
    const runtime = mockRuntime({
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-canonical",
        ELIZA_OWNER_CONTACTS_JSON: JSON.stringify({
          client_chat: { entityId: "owner-canonical" },
          discord: { entityId: "owner-canonical" },
          telegram: { entityId: "owner-shadow" },
        }),
      },
    });

    expect(getConfiguredOwnerEntityIds(runtime)).toEqual([
      "owner-canonical",
      "owner-shadow",
    ]);
    expect(hasConfiguredCanonicalOwner(runtime)).toBe(true);
  });

  it("prefers the configured canonical owner over world ownership metadata", () => {
    const runtime = mockRuntime({
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-canonical",
      },
    });

    expect(
      resolveCanonicalOwnerId(runtime, {
        ownership: { ownerId: "discord-guild-owner" },
      }),
    ).toBe("owner-canonical");
  });

  it("resolves the canonical owner for a message even when no room/world can be loaded", async () => {
    const runtime = mockRuntime({
      room: null,
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-canonical",
      },
    });

    await expect(
      resolveCanonicalOwnerIdForMessage(runtime, msg("speaker")),
    ).resolves.toBe("owner-canonical");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkSenderRole
// ═══════════════════════════════════════════════════════════════════════════

describe("checkSenderRole", () => {
  it("returns OWNER check", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { e1: "OWNER" } } },
    });
    expect(await checkSenderRole(runtime, msg("e1"))).toEqual({
      entityId: "e1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns ADMIN check", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { a1: "ADMIN" } } },
    });
    expect(await checkSenderRole(runtime, msg("a1"))).toEqual({
      entityId: "a1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns USER check (not admin)", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { u1: "USER" } } },
    });
    expect(await checkSenderRole(runtime, msg("u1"))).toEqual({
      entityId: "u1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });
  });

  it("returns GUEST for unknown entity", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
    });
    expect(await checkSenderRole(runtime, msg("unknown"))).toEqual({
      entityId: "unknown",
      role: "GUEST",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });
  });

  it("returns ADMIN for a connector-whitelisted Discord sender via live bridge metadata", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
      entities: {
        unknown: {
          metadata: {
            discord: { userId: "discord-admin-2", username: "owner" },
          },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-2"] });

    expect(await checkSenderRole(runtime, msg("unknown"))).toEqual({
      entityId: "unknown",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns ADMIN for a connector-whitelisted Discord sender", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-2"] });

    expect(
      await checkSenderRole(
        runtime,
        msg("unknown", "room-1", undefined, {
          fromId: "discord-admin-2",
          discordServerId: "guild-1",
          entityName: "owner",
        }),
      ),
    ).toEqual({
      entityId: "unknown",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns null when world can't be resolved", async () => {
    expect(
      await checkSenderRole(mockRuntime({ room: null }), msg("e1")),
    ).toBeNull();
  });

  it("returns OWNER when the sender is the stored world owner even before roles backfill", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: { ownership: { ownerId: "owner-1" }, roles: {} },
      },
    });

    expect(await checkSenderRole(runtime, msg("owner-1"))).toEqual({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("does not treat a connector-local OWNER as the canonical owner when a canonical owner is configured", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          ownership: { ownerId: "discord-guild-owner" },
          roles: { "discord-guild-owner": "OWNER" },
        },
      },
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "app-owner",
      },
    });

    expect(await checkSenderRole(runtime, msg("discord-guild-owner"))).toEqual({
      entityId: "discord-guild-owner",
      role: "GUEST",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });
  });

  it("returns OWNER for a Discord sender whose live connector identity matches the owner entity", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: { ownership: { ownerId: "owner-app" }, roles: {} },
      },
      entities: {
        "owner-app": {
          metadata: {
            discord: { userId: "discord-owner-111", username: "shaw" },
          },
        },
      },
    });

    expect(
      await checkSenderRole(
        runtime,
        msg("discord-shadow", "room-1", undefined, {
          fromId: "discord-owner-111",
          discordServerId: "guild-1",
        }),
      ),
    ).toEqual({
      entityId: "discord-shadow",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns OWNER for a sender with a confirmed identity link to the world owner", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: { ownership: { ownerId: "owner-app" }, roles: {} },
      },
      relationships: [
        {
          id: "rel-1" as UUID,
          sourceEntityId: "discord-shadow" as UUID,
          targetEntityId: "owner-app" as UUID,
          agentId: "agent-1" as UUID,
          tags: ["identity_link"],
          metadata: { status: "confirmed" },
        } as Relationship,
      ],
    });

    expect(await checkSenderRole(runtime, msg("discord-shadow"))).toEqual({
      entityId: "discord-shadow",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
    expect(runtime.getRelationships).toHaveBeenCalledWith({
      entityIds: ["discord-shadow"],
      tags: ["identity_link"],
    });
  });

  it("upgrades a linked canonical owner identity above a stored ADMIN role", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          ownership: { ownerId: "owner-app" },
          roles: { "discord-shadow": "ADMIN" },
        },
      },
      relationships: [
        {
          id: "rel-1" as UUID,
          sourceEntityId: "discord-shadow" as UUID,
          targetEntityId: "owner-app" as UUID,
          agentId: "agent-1" as UUID,
          tags: ["identity_link"],
          metadata: { status: "confirmed" },
        } as Relationship,
      ],
    });

    expect(await checkSenderRole(runtime, msg("discord-shadow"))).toEqual({
      entityId: "discord-shadow",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns OWNER for a sender linked to the configured canonical owner even when world ownership points elsewhere", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          ownership: { ownerId: "discord-guild-owner" },
          roles: { "discord-guild-owner": "OWNER" },
        },
      },
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "owner-app",
      },
      relationships: [
        {
          id: "rel-1" as UUID,
          sourceEntityId: "discord-shadow" as UUID,
          targetEntityId: "owner-app" as UUID,
          agentId: "agent-1" as UUID,
          tags: ["identity_link"],
          metadata: { status: "confirmed" },
        } as Relationship,
      ],
    });

    expect(await checkSenderRole(runtime, msg("discord-shadow"))).toEqual({
      entityId: "discord-shadow",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });
});

describe("checkSenderPrivateAccess", () => {
  it("allows the canonical owner", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: { ownership: { ownerId: "owner-1" }, roles: {} },
      },
    });

    await expect(checkSenderPrivateAccess(runtime, msg("owner-1"))).resolves.toEqual({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: true,
      accessRole: "OWNER",
      accessSource: "owner",
    });
  });

  it("allows a direct manual grant", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          roles: { teammate: "USER" },
          roleSources: { teammate: "manual" },
        },
      },
    });

    await expect(checkSenderPrivateAccess(runtime, msg("teammate"))).resolves.toEqual({
      entityId: "teammate",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
      hasPrivateAccess: true,
      accessRole: "USER",
      accessSource: "manual",
    });
  });

  it("allows a confirmed linked identity to inherit a manual grant", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          roles: { teammate: "ADMIN" },
          roleSources: { teammate: "manual" },
        },
      },
      relationships: [
        {
          id: "rel-1" as UUID,
          sourceEntityId: "discord-teammate" as UUID,
          targetEntityId: "teammate" as UUID,
          agentId: "agent-1" as UUID,
          tags: ["identity_link"],
          metadata: { status: "confirmed" },
        } as Relationship,
      ],
    });

    await expect(
      checkSenderPrivateAccess(runtime, msg("discord-teammate")),
    ).resolves.toEqual({
      entityId: "discord-teammate",
      role: "GUEST",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
      hasPrivateAccess: true,
      accessRole: "ADMIN",
      accessSource: "linked_manual",
    });
  });

  it("does not grant private access to connector-admin bootstrap alone", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: {
        id: "w1",
        metadata: {
          roles: { helper: "ADMIN" },
          roleSources: { helper: "connector_admin" },
        },
      },
      entities: {
        helper: {
          metadata: { discord: { userId: "discord-helper-1" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-helper-1"] });

    await expect(checkSenderPrivateAccess(runtime, msg("helper"))).resolves.toEqual({
      entityId: "helper",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    });
  });
});

describe("resolveWorldForMessage", () => {
  it("falls back to native Discord world metadata when the room lookup is missing", async () => {
    const runtime = mockRuntime({
      room: null,
      world: {
        id: "w-discord",
        metadata: { roles: { e1: "OWNER" as RoleName } },
      },
    });
    const message = msg("e1", "room-1", undefined, {
      fromId: "discord-owner-111",
      discordServerId: "guild-123",
    });

    const result = await resolveWorldForMessage(runtime, message);

    expect(result?.world).toEqual({
      id: "w-discord",
      metadata: { roles: { e1: "OWNER" } },
    });
    expect(runtime.getWorld).toHaveBeenCalledWith(
      createUniqueUuid(runtime, "guild-123"),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// setEntityRole
// ═══════════════════════════════════════════════════════════════════════════

describe("setEntityRole", () => {
  it("sets a new role and persists", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = {
      id: "w1",
      metadata: { roles: { e1: "OWNER" as RoleName } },
    };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: worldObj,
      updateWorld,
    });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "ADMIN");
    expect(result).toEqual({ e1: "OWNER", e2: "ADMIN" });
    expect(updateWorld).toHaveBeenCalledTimes(1);
    expect(worldObj.metadata.roleSources).toEqual({ e2: "manual" });
  });

  it("sets GUEST role (stays in map unlike old NONE behavior)", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = {
      id: "w1",
      metadata: {
        roles: { e1: "OWNER" as RoleName, e2: "ADMIN" as RoleName },
        roleSources: { e2: "manual" as const },
      },
    };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: worldObj,
      updateWorld,
    });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "GUEST");
    expect(result).toEqual({ e1: "OWNER", e2: "GUEST" });
    expect(worldObj.metadata.roleSources).toEqual({});
  });

  it("throws when world can't be resolved", async () => {
    await expect(
      setEntityRole(mockRuntime({ room: null }), msg("e1"), "e2", "ADMIN"),
    ).rejects.toThrow("Cannot resolve world");
  });

  it("initializes roles map when missing", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = { id: "w1", metadata: {} as RolesWorldMetadata };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: worldObj,
      updateWorld,
    });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "USER");
    expect(result).toEqual({ e2: "USER" });
    expect(worldObj.metadata.roleSources).toEqual({ e2: "manual" });
  });
});
