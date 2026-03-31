import { describe, expect, it, vi } from "vitest";
import {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
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
}): IAgentRuntime {
  return {
    getRoom: vi.fn().mockResolvedValue(opts.room ?? null),
    getWorld: vi.fn().mockResolvedValue(opts.world ?? null),
    updateWorld: opts.updateWorld ?? vi.fn().mockResolvedValue(undefined),
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
    expect(normalizeRole("oWnEr")).toBe("OWNER");
  });

  it("normalizes ADMIN case-insensitively", () => {
    expect(normalizeRole("ADMIN")).toBe("ADMIN");
    expect(normalizeRole("admin")).toBe("ADMIN");
    expect(normalizeRole("Admin")).toBe("ADMIN");
  });

  it("returns NONE for anything else", () => {
    for (const val of [
      "MEMBER", "moderator", "mod", "superadmin", "root",
      "NONE", "none", "UNKNOWN", "", " ", "  ADMIN  ",
    ]) {
      expect(normalizeRole(val)).toBe("NONE");
    }
  });

  it("returns NONE for nullish values", () => {
    expect(normalizeRole(undefined)).toBe("NONE");
    expect(normalizeRole(null)).toBe("NONE");
  });

  // Fuzz: random strings should never produce anything other than OWNER/ADMIN/NONE
  it("fuzz: never returns invalid role names", () => {
    const chars = "abcdefghijklmnopqrstuvwxyzADMINOWNER0123456789!@#$%^&*() ";
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(Math.random() * 20);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += chars[Math.floor(Math.random() * chars.length)];
      }
      const result = normalizeRole(s);
      expect(["OWNER", "ADMIN", "NONE"]).toContain(result);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLE_RANK
// ═══════════════════════════════════════════════════════════════════════════

describe("ROLE_RANK", () => {
  it("OWNER > ADMIN > NONE", () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.NONE);
  });

  it("covers all RoleName values", () => {
    const roles: RoleName[] = ["OWNER", "ADMIN", "NONE"];
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
      roles: { "e1": "OWNER", "e2": "ADMIN" },
    };
    expect(getEntityRole(meta, "e1")).toBe("OWNER");
    expect(getEntityRole(meta, "e2")).toBe("ADMIN");
  });

  it("returns NONE for unknown entities", () => {
    expect(getEntityRole({ roles: { x: "OWNER" } }, "y")).toBe("NONE");
  });

  it("returns NONE when metadata is undefined", () => {
    expect(getEntityRole(undefined, "e1")).toBe("NONE");
  });

  it("returns NONE when roles map is missing", () => {
    expect(getEntityRole({}, "e1")).toBe("NONE");
    expect(getEntityRole({ ownership: { ownerId: "x" } }, "e1")).toBe("NONE");
  });

  it("normalizes stored role values", () => {
    // If someone writes lowercase into the DB
    const meta = { roles: { e1: "owner" as RoleName } };
    expect(getEntityRole(meta, "e1")).toBe("OWNER");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// canModifyRole — exhaustive 3×3×3 matrix
// ═══════════════════════════════════════════════════════════════════════════

describe("canModifyRole", () => {
  const ALL_ROLES: RoleName[] = ["OWNER", "ADMIN", "NONE"];

  // Build the exhaustive truth table
  const expected: Record<string, boolean> = {
    // OWNER can do everything except no-op same→same
    "OWNER:OWNER→OWNER": false, // no-op
    "OWNER:OWNER→ADMIN": true,
    "OWNER:OWNER→NONE": true,
    "OWNER:ADMIN→OWNER": true,
    "OWNER:ADMIN→ADMIN": false, // no-op
    "OWNER:ADMIN→NONE": true,
    "OWNER:NONE→OWNER": true,
    "OWNER:NONE→ADMIN": true,
    "OWNER:NONE→NONE": false,  // no-op

    // ADMIN can only touch NONE-ranked targets, and can't promote to OWNER
    "ADMIN:OWNER→OWNER": false, // no-op
    "ADMIN:OWNER→ADMIN": false, // can't touch OWNER
    "ADMIN:OWNER→NONE": false,  // can't touch OWNER
    "ADMIN:ADMIN→OWNER": false, // can't touch peer
    "ADMIN:ADMIN→ADMIN": false, // no-op
    "ADMIN:ADMIN→NONE": false,  // can't touch peer
    "ADMIN:NONE→OWNER": false,  // can't promote to OWNER
    "ADMIN:NONE→ADMIN": true,   // promote subordinate
    "ADMIN:NONE→NONE": false,   // no-op

    // NONE can do nothing
    "NONE:OWNER→OWNER": false,
    "NONE:OWNER→ADMIN": false,
    "NONE:OWNER→NONE": false,
    "NONE:ADMIN→OWNER": false,
    "NONE:ADMIN→ADMIN": false,
    "NONE:ADMIN→NONE": false,
    "NONE:NONE→OWNER": false,
    "NONE:NONE→ADMIN": false,
    "NONE:NONE→NONE": false,
  };

  // Generate test for every combination
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

  // Extra explicit tests for clarity
  it("ADMIN can promote NONE to ADMIN", () => {
    expect(canModifyRole("ADMIN", "NONE", "ADMIN")).toBe(true);
  });

  it("symmetry: if A can't touch B, B might be able to touch A (hierarchy)", () => {
    // ADMIN can't demote OWNER, but OWNER can demote ADMIN
    expect(canModifyRole("ADMIN", "OWNER", "NONE")).toBe(false);
    expect(canModifyRole("OWNER", "ADMIN", "NONE")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveWorldForMessage
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveWorldForMessage", () => {
  it("returns world + metadata for a valid room→world chain", async () => {
    const world = { id: "w1", metadata: { roles: { e1: "OWNER" as RoleName } } };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world,
    });

    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result!.world).toBe(world);
    expect(result!.metadata.roles).toEqual({ e1: "OWNER" });
  });

  it("returns null when room not found", async () => {
    const runtime = mockRuntime({ room: null });
    expect(await resolveWorldForMessage(runtime, msg("e1"))).toBeNull();
  });

  it("returns null when room has no worldId", async () => {
    const runtime = mockRuntime({ room: { worldId: null } });
    expect(await resolveWorldForMessage(runtime, msg("e1"))).toBeNull();
  });

  it("returns null when world not found", async () => {
    const runtime = mockRuntime({ room: { worldId: "w1" }, world: null });
    expect(await resolveWorldForMessage(runtime, msg("e1"))).toBeNull();
  });

  it("returns empty metadata.roles when world has no metadata", async () => {
    const world = { id: "w1", metadata: null } as unknown;
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: world as { id: string; metadata: RolesWorldMetadata },
    });
    const result = await resolveWorldForMessage(runtime, msg("e1"));
    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkSenderRole
// ═══════════════════════════════════════════════════════════════════════════

describe("checkSenderRole", () => {
  it("returns OWNER check for world owner", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { e1: "OWNER" } } },
    });
    const result = await checkSenderRole(runtime, msg("e1"));
    expect(result).toEqual({
      entityId: "e1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns ADMIN check for admin", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: { a1: "ADMIN" } } },
    });
    const result = await checkSenderRole(runtime, msg("a1"));
    expect(result).toEqual({
      entityId: "a1",
      role: "ADMIN",
      isOwner: false,
      isAdmin: true,
      canManageRoles: true,
    });
  });

  it("returns NONE for unknown entity", async () => {
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: { id: "w1", metadata: { roles: {} } },
    });
    const result = await checkSenderRole(runtime, msg("unknown"));
    expect(result).toEqual({
      entityId: "unknown",
      role: "NONE",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });
  });

  it("returns null when world can't be resolved", async () => {
    const runtime = mockRuntime({ room: null });
    expect(await checkSenderRole(runtime, msg("e1"))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// setEntityRole
// ═══════════════════════════════════════════════════════════════════════════

describe("setEntityRole", () => {
  it("sets a new role and persists via updateWorld", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = { id: "w1", metadata: { roles: { e1: "OWNER" as RoleName } } };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: worldObj,
      updateWorld,
    });

    const result = await setEntityRole(runtime, msg("e1"), "e2", "ADMIN");
    expect(result).toEqual({ e1: "OWNER", e2: "ADMIN" });
    expect(updateWorld).toHaveBeenCalledTimes(1);
  });

  it("removes entity from roles map when set to NONE", async () => {
    const updateWorld = vi.fn().mockResolvedValue(undefined);
    const worldObj = {
      id: "w1",
      metadata: { roles: { e1: "OWNER" as RoleName, e2: "ADMIN" as RoleName } },
    };
    const runtime = mockRuntime({
      room: { worldId: "w1" },
      world: worldObj,
      updateWorld,
    });

    const result = await setEntityRole(runtime, msg("e1"), "e2", "NONE");
    expect(result).toEqual({ e1: "OWNER" });
    expect(result).not.toHaveProperty("e2");
  });

  it("throws when world can't be resolved", async () => {
    const runtime = mockRuntime({ room: null });
    await expect(
      setEntityRole(runtime, msg("e1"), "e2", "ADMIN"),
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

    const result = await setEntityRole(runtime, msg("e1"), "e2", "ADMIN");
    expect(result).toEqual({ e2: "ADMIN" });
  });
});
