import { describe, expect, it, vi } from "vitest";
import {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  matchEntityToConnectorAdminWhitelist,
  normalizeRole,
  resolveEntityRole,
  resolveWorldForMessage,
  setConnectorAdminWhitelist,
  setEntityRole,
} from "../src/utils";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import { ROLE_RANK } from "../src/types";
import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRuntime(opts: {
  room?: { worldId: string | null } | null;
  world?: { id: string; metadata: RolesWorldMetadata } | null;
  updateWorld?: ReturnType<typeof vi.fn>;
  entities?: Record<string, { names?: string[]; metadata?: Record<string, unknown> }>;
}): IAgentRuntime {
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
  } as unknown as IAgentRuntime;
}

function msg(entityId: string, roomId = "room-1"): Memory {
  return {
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    content: { text: "" },
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
      "GUEST", "guest", "MEMBER", "moderator", "NONE", "none",
      "UNKNOWN", "", " ", "  ADMIN  ", "root",
    ]) {
      expect(normalizeRole(val)).toBe("GUEST");
    }
  });

  it("returns GUEST for nullish values", () => {
    expect(normalizeRole(undefined)).toBe("GUEST");
    expect(normalizeRole(null)).toBe("GUEST");
  });

  it("fuzz: never returns invalid role names", () => {
    const chars = "abcdefghijklmnopqrstuvwxyzADMINOWNERUSERGUEST0123456789!@#$%^&*() ";
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
    const world = { id: "w1", metadata: { roles: { e1: "OWNER" as RoleName } } };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world });
    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result!.world).toBe(world);
  });

  it("returns null when room not found", async () => {
    expect(await resolveWorldForMessage(mockRuntime({ room: null }), msg("e1"))).toBeNull();
  });

  it("returns null when room has no worldId", async () => {
    expect(await resolveWorldForMessage(mockRuntime({ room: { worldId: null } }), msg("e1"))).toBeNull();
  });

  it("returns null when world not found", async () => {
    expect(await resolveWorldForMessage(mockRuntime({ room: { worldId: "w1" }, world: null }), msg("e1"))).toBeNull();
  });

  it("returns empty metadata when world has null metadata", async () => {
    const world = { id: "w1", metadata: null } as unknown;
    const runtime = mockRuntime({ room: { worldId: "w1" }, world: world as any });
    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual({});
  });
});

describe("resolveEntityRole", () => {
  it("promotes a connector-whitelisted Discord entity to ADMIN", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const world = { id: "w1", metadata: { roles: {} } as RolesWorldMetadata };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world,
      updateWorld,
      entities: {
        speaker: {
          metadata: { discord: { userId: "discord-admin-1", username: "owner" } },
        },
      },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-1"] });

    const role = await resolveEntityRole(runtime, world, world.metadata, "speaker");
    expect(role).toBe("ADMIN");
    expect(world.metadata.roles?.speaker).toBe("ADMIN");
    expect(updateWorld).toHaveBeenCalledTimes(1);
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
      entityId: "e1", role: "OWNER", isOwner: true, isAdmin: true, canManageRoles: true,
    });
  });

  it("returns ADMIN check", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { a1: "ADMIN" } } },
    });
    expect(await checkSenderRole(runtime, msg("a1"))).toEqual({
      entityId: "a1", role: "ADMIN", isOwner: false, isAdmin: true, canManageRoles: true,
    });
  });

  it("returns USER check (not admin)", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { u1: "USER" } } },
    });
    expect(await checkSenderRole(runtime, msg("u1"))).toEqual({
      entityId: "u1", role: "USER", isOwner: false, isAdmin: false, canManageRoles: false,
    });
  });

  it("returns GUEST for unknown entity", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
    });
    expect(await checkSenderRole(runtime, msg("unknown"))).toEqual({
      entityId: "unknown", role: "GUEST", isOwner: false, isAdmin: false, canManageRoles: false,
    });
  });

  it("returns ADMIN for a connector-whitelisted Discord sender", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
      entities: {
        unknown: {
          metadata: { discord: { userId: "discord-admin-2", username: "owner" } },
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

  it("returns null when world can't be resolved", async () => {
    expect(await checkSenderRole(mockRuntime({ room: null }), msg("e1"))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// setEntityRole
// ═══════════════════════════════════════════════════════════════════════════

describe("setEntityRole", () => {
  it("sets a new role and persists", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = { id: "w1", metadata: { roles: { e1: "OWNER" as RoleName } } };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world: worldObj, updateWorld });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "ADMIN");
    expect(result).toEqual({ e1: "OWNER", e2: "ADMIN" });
    expect(updateWorld).toHaveBeenCalledTimes(1);
  });

  it("sets GUEST role (stays in map unlike old NONE behavior)", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = { id: "w1", metadata: { roles: { e1: "OWNER" as RoleName, e2: "ADMIN" as RoleName } } };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world: worldObj, updateWorld });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "GUEST");
    expect(result).toEqual({ e1: "OWNER", e2: "GUEST" });
  });

  it("throws when world can't be resolved", async () => {
    await expect(
      setEntityRole(mockRuntime({ room: null }), msg("e1"), "e2", "ADMIN"),
    ).rejects.toThrow("Cannot resolve world");
  });

  it("initializes roles map when missing", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = { id: "w1", metadata: {} as RolesWorldMetadata };
    const runtime = mockRuntime({ room: { worldId: "w1" }, world: worldObj, updateWorld });
    const result = await setEntityRole(runtime, msg("e1"), "e2", "USER");
    expect(result).toEqual({ e2: "USER" });
  });
});
