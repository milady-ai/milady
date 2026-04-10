import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateRoleAction } from "../src/action";
import type { RoleName, RolesWorldMetadata } from "../src/types";
import { setConnectorAdminWhitelist } from "../src/utils";

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
  settings?: Record<string, string | boolean | number | null>,
  options?: {
    worlds?: Array<ReturnType<typeof createMockWorld>>;
    roomMemories?: Memory[];
    services?: Record<string, unknown>;
  },
): IAgentRuntime {
  const settingsStore = { ...(settings ?? {}) };
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
    getAllWorlds: vi.fn().mockResolvedValue(options?.worlds ?? [world]),
    updateWorld: vi.fn().mockResolvedValue(undefined),
    getEntitiesForRoom: vi.fn().mockResolvedValue(entityObjects),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const e = entities[id];
      if (!e) return null;
      return { id, names: e.names, metadata: e.metadata ?? {} };
    }),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue(options?.roomMemories ?? []),
    getService: vi
      .fn()
      .mockImplementation((name: string) => options?.services?.[name] ?? null),
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

function createMessage(
  entityId: string,
  text: string,
  roomId = "room-1" as UUID,
  metadata?: Record<string, unknown>,
): Memory {
  return {
    entityId: entityId as UUID,
    roomId,
    content: {
      text,
      ...(metadata ? { metadata } : {}),
    },
  } as Memory;
}

const EMPTY_STATE = {} as never;

function setWorldRole(
  world: ReturnType<typeof createMockWorld>,
  entityId: string,
  role: RoleName,
): void {
  const roles = world.metadata.roles ?? {};
  roles[entityId] = role;
  world.metadata.roles = roles;
}

// ═══════════════════════════════════════════════════════════════════════════
// validate — parseRoleCommand coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("updateRoleAction.validate", () => {
  const runtime = {} as IAgentRuntime;

  describe("slash command format", () => {
    it("/role @name ADMIN", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice ADMIN"),
        ),
      ).toBe(true);
    });
    it("/role @name OWNER", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice OWNER"),
        ),
      ).toBe(true);
    });
    it("/role @name USER", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice USER"),
        ),
      ).toBe(true);
    });
    it("/role @name GUEST", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice GUEST"),
        ),
      ).toBe(true);
    });
    it("/role @name MEMBER (legacy alias)", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice MEMBER"),
        ),
      ).toBe(true);
    });
    it("/role @name NONE (legacy alias)", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice NONE"),
        ),
      ).toBe(true);
    });
    it("role @name ADMIN (no slash)", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "role @alice ADMIN"),
        ),
      ).toBe(true);
    });
    it("case insensitive role", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice guest"),
        ),
      ).toBe(true);
    });
  });

  describe("make format", () => {
    it("make @name admin", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "make @alice admin"),
        ),
      ).toBe(true);
    });
    it("make @name an admin", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "make @alice an admin"),
        ),
      ).toBe(true);
    });
    it("make name user", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "make bob user"),
        ),
      ).toBe(true);
    });
  });

  describe("set format", () => {
    it("set @name role ADMIN", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "set @alice role ADMIN"),
        ),
      ).toBe(true);
    });
    it("set @name GUEST", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "set @alice GUEST"),
        ),
      ).toBe(true);
    });
  });

  describe("natural language assignment", () => {
    // --- boss-family → ADMIN ---
    it.each([
      "nubs is your boss",
      "alice is my boss",
      "bob is our manager",
      "charlie is a supervisor",
      "dave is your superior",
      "eve is an lead",
      "@frank is your boss",
      "nubs is your boss!",
      "nubs is your boss.",
      "nubs is your Boss",
      "NUBS IS YOUR BOSS",
    ])("accepts boss-family assignment: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    // --- coworker-family → USER ---
    it.each([
      "alice is your coworker",
      "alice is my co-worker",
      "bob is your teammate",
      "charlie is a colleague",
      "dave is your peer",
      "eve is your friend",
      "frank is a partner",
      "@alice is your coworker",
      "alice is ur coworker",
    ])("accepts coworker-family assignment: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    // --- inverted: "my LABEL is X" ---
    it.each([
      "my boss is alice",
      "your coworker is bob",
      "our manager is charlie",
    ])("accepts inverted assignment: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    // --- treat/consider ---
    it.each([
      "treat alice as your boss",
      "consider bob your coworker",
      "treat charlie like my teammate",
      "please treat alice as your boss",
      "hey treat bob like a friend",
    ])("accepts treat/consider: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });
  });

  describe("natural language negation", () => {
    it.each([
      "alice is not your boss",
      "alice isn't your boss",
      "alice isnt your boss",
      "bob is no longer your coworker",
      "charlie is not my manager",
      "dave isn't a friend",
      "eve is not your boss anymore",
      "frank is not your teammate any more",
      "@alice is not your boss",
      "alice is not ur boss",
    ])("accepts negation: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    it.each([
      "don't treat alice as your boss",
      "do not treat bob as your coworker",
      "don't consider charlie your friend",
      "do not consider dave like a teammate",
    ])("accepts don't-treat negation: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    it.each([
      "remove alice as boss",
      "remove bob as your coworker",
      "remove charlie as a friend",
    ])("accepts remove-as negation: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });
  });

  describe("tentative natural language", () => {
    it.each([
      "I think alice is your boss",
      "i guess bob is my coworker",
      "i figure charlie is a friend",
    ])("accepts tentative assignment: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });

    it.each([
      "I think alice is not your boss",
      "i guess bob isn't my coworker",
      "i figure charlie is no longer a friend",
    ])("accepts tentative negation: %s", async (text) => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", text)),
      ).toBe(true);
    });
  });

  describe("rejection cases", () => {
    it("rejects empty string", async () => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", "")),
      ).toBe(false);
    });
    it("rejects unrelated text", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "hello world"),
        ),
      ).toBe(false);
    });
    it("rejects /role with no args", async () => {
      expect(
        await updateRoleAction.validate(runtime, createMessage("e1", "/role")),
      ).toBe(false);
    });
    it("rejects invalid role name", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice SUPERADMIN"),
        ),
      ).toBe(false);
    });
    it("rejects multi-line messages", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice ADMIN\nextra stuff"),
        ),
      ).toBe(false);
    });
    it("rejects nullish message", async () => {
      expect(
        await updateRoleAction.validate(runtime, null as unknown as Memory),
      ).toBe(false);
    });
  });

  describe("legacy aliases", () => {
    it("MEMBER maps to GUEST", async () => {
      // validate returns true; the handler will set GUEST
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice MEMBER"),
        ),
      ).toBe(true);
    });
    it("NONE maps to GUEST", async () => {
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", "/role @alice NONE"),
        ),
      ).toBe(true);
    });
  });

  describe("input limits", () => {
    it("rejects oversized input (>200 chars)", async () => {
      const longName = "a".repeat(180);
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", `/role @${longName} ADMIN`),
        ),
      ).toBe(false);
    });
    it("rejects oversized username (>64 chars)", async () => {
      const longName = "a".repeat(65);
      expect(
        await updateRoleAction.validate(
          runtime,
          createMessage("e1", `/role @${longName} ADMIN`),
        ),
      ).toBe(false);
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
        const result = await updateRoleAction.validate(
          runtime,
          createMessage("e1", input),
        );
        expect(typeof result).toBe("boolean");
      });
    }
  });

  describe("fuzz: random strings", () => {
    it("never throws on 1000 random inputs", async () => {
      const chars =
        "abcdefghijklmnopqrstuvwxyz /role@make set ADMIN OWNER USER GUEST 0123456789\n\t";
      for (let i = 0; i < 1000; i++) {
        const len = Math.floor(Math.random() * 100);
        let s = "";
        for (let j = 0; j < len; j++) {
          s += chars[Math.floor(Math.random() * chars.length)];
        }
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

  it("OWNER promotes GUEST to ADMIN", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
    expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
  });

  it("OWNER promotes GUEST to USER", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice USER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
  });

  it("OWNER sets to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice GUEST"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("rejects assigning OWNER to a non-canonical entity", async () => {
    runtime = createMockRuntime(
      world,
      {
        [ownerId]: { names: ["Shaw"] },
        [targetId]: {
          names: ["alice"],
          metadata: { discord: { username: "alice", name: "Alice" } },
        },
      },
      {
        ELIZA_ADMIN_ENTITY_ID: ownerId,
      },
    );

    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice OWNER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(world.metadata.roles?.[targetId]).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("reserved for the canonical agent owner"),
      }),
    );
  });

  it("ADMIN promotes GUEST to USER", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "/role @alice USER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
  });

  it("does not trust bridge sender metadata from message content", async () => {
    const discordAdminId = "discord-admin-uuid";
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [discordAdminId]: { names: ["owner"] },
      [targetId]: { names: ["alice"] },
    });
    setConnectorAdminWhitelist(runtime, { discord: ["discord-admin-1"] });

    const result = await updateRoleAction.handler(
      runtime,
      createMessage(discordAdminId, "/role @alice USER", "room-1" as UUID, {
        bridgeSender: {
          metadata: {
            discord: { userId: "discord-admin-1", username: "owner" },
          },
        },
      }),
      EMPTY_STATE,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(world.metadata.roles?.[targetId]).toBeUndefined();
    expect(world.metadata.roles?.[discordAdminId]).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("don't have permission"),
      }),
    );
  });

  it("ADMIN promotes GUEST to ADMIN", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "/role @alice ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("ADMIN demotes USER to GUEST", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    setWorldRole(world, targetId, "USER");
    world.metadata.roleSources = {
      [adminId]: "manual",
      [targetId]: "manual",
    };
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "/role @alice GUEST"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
    expect(world.metadata.roleSources?.[targetId]).toBeUndefined();
  });

  it("legacy MEMBER alias sets to GUEST", async () => {
    setWorldRole(world, targetId, "USER");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice MEMBER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("legacy NONE alias sets to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice NONE"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("make syntax works", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "make @alice admin"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("set syntax works", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "set @alice role USER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("'nubs is your boss' sets ADMIN role (not ownership transfer)", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: {
        names: ["nubs"],
        metadata: { discord: { username: "nubs" } },
      },
    });

    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "nubs is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("nubs is now your boss"),
      }),
    );
  });

  it("uses recent room speakers to resolve a boss target not currently in the room entity list", async () => {
    const relationships = {
      analyzeRelationship: vi.fn().mockResolvedValue({
        strength: 82,
        interactionCount: 9,
        sharedConversationWindows: 2,
        lastInteractionAt: new Date().toISOString(),
      }),
      searchContacts: vi.fn().mockResolvedValue([]),
      getContact: vi.fn().mockResolvedValue(null),
    };
    runtime = createMockRuntime(
      world,
      {
        [ownerId]: { names: ["Shaw"] },
        [targetId]: {
          names: ["nubs"],
          metadata: { discord: { username: "nubs" } },
        },
      },
      undefined,
      {
        roomMemories: [
          {
            id: "recent-message-1" as UUID,
            roomId: "room-1" as UUID,
            entityId: targetId as UUID,
            createdAt: Date.now() - 1000,
            content: { text: "checking in" },
          } as Memory,
        ],
        services: { relationships },
      },
    );
    (
      runtime.getEntitiesForRoom as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ id: ownerId as UUID, names: ["Shaw"], metadata: {} }]);

    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "nubs is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("uses rolodex strength to resolve a boss target outside the current room", async () => {
    const relationships = {
      analyzeRelationship: vi.fn().mockResolvedValue({
        strength: 91,
        interactionCount: 14,
        sharedConversationWindows: 3,
        lastInteractionAt: new Date().toISOString(),
      }),
      searchContacts: vi.fn().mockResolvedValue([
        {
          entityId: targetId as UUID,
          customFields: { displayName: "Nubs" },
        },
      ]),
      getContact: vi.fn().mockResolvedValue({
        entityId: targetId as UUID,
        customFields: { displayName: "Nubs" },
      }),
    };
    runtime = createMockRuntime(
      world,
      {
        [ownerId]: { names: ["Shaw"] },
        [targetId]: {
          names: ["Nubs Prime"],
          metadata: { discord: { username: "nubs" } },
        },
      },
      undefined,
      {
        services: { relationships },
      },
    );
    (
      runtime.getEntitiesForRoom as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ id: ownerId as UUID, names: ["Shaw"], metadata: {} }]);

    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "nubs is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("returns previousRole and newRole in result data", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice USER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          previousRole: "ADMIN",
          newRole: "USER",
        }),
      }),
    );
  });

  // --- Entity lookup paths ---

  it("finds entity by metadata username", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [targetId]: {
        names: [],
        metadata: { discord: { username: "aliceinwonderland" } },
      },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @aliceinwonderland ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  it("entity lookup is case-insensitive", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @Alice ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  // --- Failure paths ---

  it("rejects if requester is USER", async () => {
    const userId = "user-uuid";
    setWorldRole(world, userId, "USER");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [userId]: { names: ["regular"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(userId, "/role @alice ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("permission"),
      }),
    );
  });

  it("rejects if requester is GUEST", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage("nobody" as UUID, "/role @alice ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects if target not found", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @nonexistent ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Could not find"),
      }),
    );
  });

  it("rejects changing agent's own role", async () => {
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      "agent-uuid": { names: ["agent"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @agent ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects ADMIN trying to promote to OWNER", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "/role @alice OWNER"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("ADMIN can say 'X is your boss' (sets ADMIN, not OWNER)", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["nubs"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "nubs is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("rejects ADMIN trying to demote another ADMIN", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    setWorldRole(world, targetId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "/role @alice GUEST"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  // --- Last OWNER guard ---

  it("prevents the last OWNER from demoting themselves", async () => {
    runtime = createMockRuntime(world, { [ownerId]: { names: ["Shaw"] } });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @Shaw ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("last OWNER"),
      }),
    );
  });

  it("allows OWNER self-demotion when another OWNER exists", async () => {
    const owner2 = "owner2-uuid";
    setWorldRole(world, owner2, "OWNER");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [owner2]: { names: ["CoOwner"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @Shaw ADMIN"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });

  // --- Natural language assignment handler ---

  it("'alice is your coworker' sets USER role", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is your coworker"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "alice is now your coworker.",
      }),
    );
  });

  it("'alice is your manager' sets ADMIN role", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is your manager"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "alice is now your manager.",
      }),
    );
  });

  it("'treat alice as your friend' sets USER role", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "treat alice as your friend"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("USER");
  });

  it("inverted 'my boss is alice' sets ADMIN", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "my boss is alice"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("ADMIN");
  });

  it("returns label in result data", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          label: "boss",
          newRole: "ADMIN",
        }),
      }),
    );
  });

  // --- Natural language revocation handler ---

  it("'alice is not your boss' revokes to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is not your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "alice is no longer your boss.",
      }),
    );
  });

  it("'alice isn't your coworker' revokes to GUEST", async () => {
    setWorldRole(world, targetId, "USER");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice isn't your coworker"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "alice is no longer your coworker.",
      }),
    );
  });

  it("'alice is no longer your manager' revokes to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is no longer your manager"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("'remove alice as boss' revokes to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "remove alice as boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("'don't treat alice as your boss' revokes to GUEST", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "don't treat alice as your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("returns revoked flag in result data for negation", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "alice is not your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          revoked: true,
          revokedLabel: "boss",
          newRole: "GUEST",
        }),
      }),
    );
  });

  it("ADMIN can revoke USER via natural language", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    setWorldRole(world, targetId, "USER");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "alice is not your coworker"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(world.metadata.roles?.[targetId]).toBe("GUEST");
  });

  it("ADMIN cannot revoke another ADMIN via natural language", async () => {
    const adminId = "admin-uuid";
    setWorldRole(world, adminId, "ADMIN");
    setWorldRole(world, targetId, "ADMIN");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [adminId]: { names: ["mod"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(adminId, "alice is not your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  it("USER cannot assign natural language roles", async () => {
    const userId = "user-uuid";
    setWorldRole(world, userId, "USER");
    runtime = createMockRuntime(world, {
      [ownerId]: { names: ["Shaw"] },
      [userId]: { names: ["regular"] },
      [targetId]: { names: ["alice"] },
    });
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(userId, "alice is your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("permission"),
      }),
    );
  });

  it("GUEST cannot revoke natural language roles", async () => {
    setWorldRole(world, targetId, "ADMIN");
    const result = await updateRoleAction.handler(
      runtime,
      createMessage("nobody" as UUID, "alice is not your boss"),
      EMPTY_STATE,
      undefined,
      callback,
    );
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });

  // --- Callback handling ---

  it("works when callback is undefined", async () => {
    const result = await updateRoleAction.handler(
      runtime,
      createMessage(ownerId, "/role @alice ADMIN"),
      EMPTY_STATE,
      undefined,
      undefined,
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });
});
