import { describe, expect, it, vi, beforeEach } from "vitest";
import { updateRoleAction } from "../src/action";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorld(
  worldId: string,
  ownerId: string,
  roles: Record<string, RoleName> = {},
): { id: string; metadata: RolesWorldMetadata } {
  return {
    id: worldId,
    metadata: {
      ownership: { ownerId },
      roles: { [ownerId]: "OWNER", ...roles },
    },
  };
}

function createMockRuntime(
  world: ReturnType<typeof createMockWorld>,
  entities: Record<
    string,
    { names: string[]; metadata?: Record<string, Record<string, string>> }
  > = {},
): IAgentRuntime {
  // getEntitiesForRoom returns entity objects (per linter fix)
  const entityObjects = Object.entries(entities).map(([id, e]) => ({
    id: id as UUID,
    names: e.names,
    metadata: e.metadata ?? {},
  }));
  return {
    agentId: "agent-uuid" as UUID,
    getRoom: vi.fn().mockResolvedValue({ worldId: world.id }),
    getWorld: vi.fn().mockResolvedValue(world),
    updateWorld: vi.fn().mockResolvedValue(undefined),
    getEntitiesForRoom: vi.fn().mockResolvedValue(entityObjects),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const e = entities[id];
      if (!e) return null;
      return { id, names: e.names, metadata: e.metadata ?? {} };
    }),
  } as unknown as IAgentRuntime;
}

function createMessage(
  entityId: string,
  text: string,
  roomId = "room-1" as UUID,
): Memory {
  return {
    entityId: entityId as UUID,
    roomId,
    content: { text },
  } as Memory;
}

// ═══════════════════════════════════════════════════════════════════════════
// validate — parseRoleCommand coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("updateRoleAction.validate", () => {
  const runtime = {} as IAgentRuntime;

  describe("slash command format", () => {
    it("/role @name ADMIN", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice ADMIN"))).toBe(true);
    });
    it("/role @name OWNER", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice OWNER"))).toBe(true);
    });
    it("/role @name USER", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice USER"))).toBe(true);
    });
    it("/role @name GUEST", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice GUEST"))).toBe(true);
    });
    it("/role @name MEMBER (legacy alias)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice MEMBER"))).toBe(true);
    });
    it("/role @name NONE (legacy alias)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice NONE"))).toBe(true);
    });
    it("role @name ADMIN (no slash)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "role @alice ADMIN"))).toBe(true);
    });
    it("case insensitive role", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice guest"))).toBe(true);
    });
  });

  describe("make format", () => {
    it("make @name admin", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make @alice admin"))).toBe(true);
    });
    it("make @name an admin", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make @alice an admin"))).toBe(true);
    });
    it("make name user", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make bob user"))).toBe(true);
    });
  });

  describe("set format", () => {
    it("set @name role ADMIN", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "set @alice role ADMIN"))).toBe(true);
    });
    it("set @name GUEST", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "set @alice GUEST"))).toBe(true);
    });
  });

  describe("rejection cases", () => {
    it("rejects empty string", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", ""))).toBe(false);
    });
    it("rejects unrelated text", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "hello world"))).toBe(false);
    });
    it("rejects /role with no args", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role"))).toBe(false);
    });
    it("rejects invalid role name", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice SUPERADMIN"))).toBe(false);
    });
    it("rejects multi-line messages", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice ADMIN\nextra stuff"))).toBe(false);
    });
    it("rejects nullish message", async () => {
      expect(await updateRoleAction.validate(runtime, null as unknown as Memory)).toBe(false);
    });
  });

  describe("legacy aliases", () => {
    it("MEMBER maps to GUEST", async () => {
      // validate returns true; the handler will set GUEST
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice MEMBER"))).toBe(true);
    });
    it("NONE maps to GUEST", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice NONE"))).toBe(true);
    });
  });

  describe("input limits", () => {
    it("rejects oversized input (>200 chars)", async () => {
      const longName = "a".repeat(180);
      expect(await updateRoleAction.validate(runtime, createMessage("e1", `/role @${longName} ADMIN`))).toBe(false);
    });
    it("rejects oversized username (>64 chars)", async () => {
      const longName = "a".repeat(65);
      expect(await updateRoleAction.validate(runtime, createMessage("e1", `/role @${longName} ADMIN`))).toBe(false);
    });
  });

  describe("fuzz: injection attempts", () => {
    const injections = [
      '/role @"; DROP TABLE users;-- ADMIN',
      "/role @<script>alert(1)</script> ADMIN",
      "/role @__proto__ ADMIN",
      "/role @../../etc/passwd ADMIN",
      "/role @alice ADMIN; rm -rf /",
      "/role @alice ADMIN\r\nX-Injected: true",
    ];
    for (const input of injections) {
      it(`handles: ${input.slice(0, 50)}...`, async () => {
        const result = await updateRoleAction.validate(runtime, createMessage("e1", input));
        expect(typeof result).toBe("boolean");
      });
    }
  });

  describe("fuzz: random strings", () => {
    it("never throws on 1000 random inputs", async () => {
      const chars = "abcdefghijklmnopqrstuvwxyz /role@make set ADMIN OWNER USER GUEST 0123456789\n\t";
      for (let i = 0; i < 1000; i++) {
        const len = Math.floor(Math.random() * 100);
        let s = "";
        for (let j = 0; j < len; j++) {
          s += chars[Math.floor(Math.random() * chars.length)];
        }
        const result = await updateRoleAction.validate(runtime, createMessage("e1", s));
        expect(typeof result).toBe("boolean");
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handler — behavioral tests
// ═══════════════════════════════════════════════════════════════════════════

describe("updateRoleAction.handler", () => {
  const ownerId = "owner-uuid";
  const targetId = "target-uuid";
  let world: ReturnType<typeof createMockWorld>;
  let runtime: IAgentRuntime;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    world = createMockWorld("world-1", ownerId);
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: {
        names: ["alice"],
        metadata: { discord: { username: "alice", name: "Alice" } },
      },
    });
    callback = vi.fn();
  });

  // --- Success paths ---

  it("OWNER promotes GUEST to ADMIN", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
  });

  it("OWNER promotes GUEST to USER", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice USER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
  });

  it("OWNER sets to GUEST", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice GUEST"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("OWNER promotes to OWNER", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice OWNER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("OWNER");
  });

  it("ADMIN promotes GUEST to USER", async () => {
    const adminId = "admin-uuid";
    world.metadata.roles![adminId] = "ADMIN";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(adminId, "/role @alice USER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
  });

  it("ADMIN promotes GUEST to ADMIN", async () => {
    const adminId = "admin-uuid";
    world.metadata.roles![adminId] = "ADMIN";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(adminId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("ADMIN demotes USER to GUEST", async () => {
    const adminId = "admin-uuid";
    world.metadata.roles![adminId] = "ADMIN";
    world.metadata.roles![targetId] = "USER";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(adminId, "/role @alice GUEST"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("legacy MEMBER alias sets to GUEST", async () => {
    world.metadata.roles![targetId] = "USER";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice MEMBER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("legacy NONE alias sets to GUEST", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice NONE"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("make syntax works", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "make @alice admin"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("set syntax works", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "set @alice role USER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("returns previousRole and newRole in result data", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice USER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ previousRole: "ADMIN", newRole: "USER" }),
    }));
  });

  // --- Entity lookup paths ---

  it("finds entity by metadata username", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: { names: [], metadata: { discord: { username: "aliceinwonderland" } } },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @aliceinwonderland ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("entity lookup is case-insensitive", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @Alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  // --- Failure paths ---

  it("rejects if requester is USER", async () => {
    const userId = "user-uuid";
    world.metadata.roles![userId] = "USER";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [userId]: { names: ["regular"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(userId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("permission"),
    }));
  });

  it("rejects if requester is GUEST", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage("nobody" as UUID, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects if target not found", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @nonexistent ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Could not find"),
    }));
  });

  it("rejects changing agent's own role", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      "agent-uuid": { names: ["agent"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @agent ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects ADMIN trying to promote to OWNER", async () => {
    const adminId = "admin-uuid";
    world.metadata.roles![adminId] = "ADMIN";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(adminId, "/role @alice OWNER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects ADMIN trying to demote another ADMIN", async () => {
    const adminId = "admin-uuid";
    world.metadata.roles![adminId] = "ADMIN";
    world.metadata.roles![targetId] = "ADMIN";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(adminId, "/role @alice GUEST"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  // --- Last OWNER guard ---

  it("prevents the last OWNER from demoting themselves", async () => {
    runtime = createMockRuntime(world, { [ownerId]: { names: ["Shaw"] } });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @Shaw ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("last OWNER"),
    }));
  });

  it("allows OWNER self-demotion when another OWNER exists", async () => {
    const owner2 = "owner2-uuid";
    world.metadata.roles![owner2] = "OWNER";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [owner2]: { names: ["CoOwner"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @Shaw ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  // --- Callback handling ---

  it("works when callback is undefined", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice ADMIN"), {} as any, undefined, undefined,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });
});
