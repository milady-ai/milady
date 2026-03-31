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
  const entityList = Object.keys(entities) as UUID[];
  return {
    agentId: "agent-uuid" as UUID,
    getRoom: vi.fn().mockResolvedValue({ worldId: world.id }),
    getWorld: vi.fn().mockResolvedValue(world),
    updateWorld: vi.fn().mockResolvedValue(undefined),
    getEntitiesForRoom: vi.fn().mockResolvedValue(entityList),
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
    it("/role @name NONE", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice NONE"))).toBe(true);
    });
    it("/role @name MEMBER (alias)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice MEMBER"))).toBe(true);
    });
    it("/role name ADMIN (no @)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role alice ADMIN"))).toBe(true);
    });
    it("role @name ADMIN (no slash)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "role @alice ADMIN"))).toBe(true);
    });
    it("case insensitive role", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice admin"))).toBe(true);
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice Admin"))).toBe(true);
    });
  });

  describe("make format", () => {
    it("make @name admin", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make @alice admin"))).toBe(true);
    });
    it("make @name an admin", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make @alice an admin"))).toBe(true);
    });
    it("make @name a admin", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make @alice a admin"))).toBe(true);
    });
    it("make name owner", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "make bob owner"))).toBe(true);
    });
  });

  describe("set format", () => {
    it("set @name role ADMIN", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "set @alice role ADMIN"))).toBe(true);
    });
    it("set @name ADMIN (no 'role' keyword)", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "set @alice ADMIN"))).toBe(true);
    });
  });

  describe("rejection cases", () => {
    it("rejects empty string", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", ""))).toBe(false);
    });
    it("rejects unrelated text", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "hello world"))).toBe(false);
    });
    it("rejects role mention in conversation", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "what is my role?"))).toBe(false);
    });
    it("rejects /role with no args", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role"))).toBe(false);
    });
    it("rejects /role with only username", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice"))).toBe(false);
    });
    it("rejects invalid role name", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice SUPERADMIN"))).toBe(false);
    });
    it("rejects multi-line messages", async () => {
      expect(await updateRoleAction.validate(runtime, createMessage("e1", "/role @alice ADMIN\nextra stuff"))).toBe(false);
    });
    it("rejects when message.content.text is not a string", async () => {
      const msg = { entityId: "e1" as UUID, roomId: "r1" as UUID, content: { text: 12345 } } as unknown as Memory;
      expect(await updateRoleAction.validate(runtime, msg)).toBe(false);
    });
    it("rejects when message is nullish", async () => {
      expect(await updateRoleAction.validate(runtime, null as unknown as Memory)).toBe(false);
    });
  });

  describe("input limits", () => {
    it("rejects oversized input (>200 chars)", async () => {
      const longName = "a".repeat(180);
      expect(await updateRoleAction.validate(runtime, createMessage("e1", `/role @${longName} ADMIN`))).toBe(false);
    });

    it("rejects oversized username (>64 chars)", async () => {
      const longName = "a".repeat(65);
      // Total message is under 200 chars but username is >64
      expect(await updateRoleAction.validate(runtime, createMessage("e1", `/role @${longName} ADMIN`))).toBe(false);
    });

    it("accepts exactly 64-char username", async () => {
      const name = "a".repeat(64);
      expect(await updateRoleAction.validate(runtime, createMessage("e1", `/role @${name} ADMIN`))).toBe(true);
    });
  });

  describe("fuzz: injection attempts", () => {
    const injections = [
      '/role @"; DROP TABLE users;-- ADMIN',
      "/role @<script>alert(1)</script> ADMIN",
      "/role @{{constructor.constructor}} ADMIN",
      "/role @__proto__ ADMIN",
      "/role @../../etc/passwd ADMIN",
      "/role @\x00nullbyte ADMIN",
      "/role @name\tADMIN",       // tab in middle
      "  /role  @alice  ADMIN  ", // extra spaces
      "/role @alice ADMIN; rm -rf /",
      "/role @alice ADMIN\r\nX-Injected: true",
    ];

    for (const input of injections) {
      it(`handles: ${input.slice(0, 60)}...`, async () => {
        const result = await updateRoleAction.validate(
          runtime,
          createMessage("e1", input),
        );
        // Should either reject or accept safely — never throw
        expect(typeof result).toBe("boolean");
      });
    }
  });

  describe("fuzz: random strings", () => {
    it("never throws on 1000 random inputs", async () => {
      const chars = "abcdefghijklmnopqrstuvwxyz /role@make set ADMIN OWNER NONE 0123456789!@#$%^&*()\n\t\r";
      for (let i = 0; i < 1000; i++) {
        const len = Math.floor(Math.random() * 100);
        let s = "";
        for (let j = 0; j < len; j++) {
          s += chars[Math.floor(Math.random() * chars.length)];
        }
        // Must not throw
        const result = await updateRoleAction.validate(
          runtime,
          createMessage("e1", s),
        );
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

  it("OWNER promotes user to ADMIN via /role", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("ADMIN"),
    }));
  });

  it("OWNER promotes user to OWNER", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice OWNER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("OWNER");
  });

  it("OWNER demotes ADMIN to NONE", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice NONE"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBeUndefined();
  });

  it("ADMIN promotes NONE to ADMIN", async () => {
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

  it("handler works with 'make' syntax", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "make @alice admin"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("handler works with 'set' syntax", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "set @alice role ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("MEMBER alias sets role to NONE (removes from map)", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice MEMBER"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBeUndefined();
  });

  it("returns previousRole and newRole in result data", async () => {
    world.metadata.roles![targetId] = "ADMIN";
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice NONE"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        previousRole: "ADMIN",
        newRole: "NONE",
        targetEntityId: targetId,
      }),
    }));
  });

  // --- Entity lookup paths ---

  it("finds entity by metadata username", async () => {
    // alice is only findable via discord metadata
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: {
        names: [],
        metadata: { discord: { username: "aliceinwonderland", name: "Alice" } },
      },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @aliceinwonderland ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("finds entity by metadata name field", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: {
        names: [],
        metadata: { telegram: { name: "bobthebuilder" } },
      },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @bobthebuilder ADMIN"), {} as any, undefined, callback,
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

  it("rejects if requester has NONE role", async () => {
    const nobodyId = "nobody-uuid";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: { names: ["alice"] },
      [nobodyId]: { names: ["nobody"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(nobodyId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("permission"),
    }));
    expect(runtime.updateWorld).not.toHaveBeenCalled();
  });

  it("rejects if target not found in room", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @nonexistent ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Could not find"),
    }));
  });

  it("rejects changing the agent's own role", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      "agent-uuid": { names: ["agent"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @agent ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("agent"),
    }));
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
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("permissions"),
    }));
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
      runtime, createMessage(adminId, "/role @alice NONE"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects when no world context", async () => {
    runtime = {
      ...runtime,
      getRoom: vi.fn().mockResolvedValue(null),
    } as unknown as IAgentRuntime;
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice ADMIN"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("no world context"),
    }));
  });

  it("rejects when command can't be parsed (handler safety)", async () => {
    // This shouldn't happen if validate gates, but test handler defensively
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "gibberish"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Usage"),
    }));
  });

  // --- Last OWNER guard ---

  it("prevents the last OWNER from demoting themselves", async () => {
    // Owner tries to set themselves to NONE
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
    });
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @Shaw NONE"), {} as any, undefined, callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("last OWNER"),
    }));
    expect(runtime.updateWorld).not.toHaveBeenCalled();
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
    expect(world.metadata.roles?.[ownerId]).toBe("ADMIN");
  });

  // --- Callback handling ---

  it("works when callback is undefined", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage(ownerId, "/role @alice ADMIN"), {} as any, undefined, undefined,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("works when callback is undefined on failure path", async () => {
    const result = await updateRoleAction.handler(
      runtime, createMessage("nobody" as UUID, "/role @alice ADMIN"), {} as any, undefined, undefined,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });
});
