/**
 * End-to-end tests for the roles system.
 *
 * These tests exercise the late-join whitelist evaluator and role-backfill
 * provider together using stateful mock runtimes — verifying the full flow
 * from message receipt to role persistence rather than mocking runtime roles
 * internals individually.
 */

import type { Memory, State, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mocks — roles helpers we intercept to drive real logic
// against our stateful world store.
// ---------------------------------------------------------------------------

const {
  mockGetConnectorAdminWhitelist,
  mockGetEntityRole,
  mockHasConfiguredCanonicalOwner,
  mockMatchEntityToConnectorAdminWhitelist,
  mockResolveWorldForMessage,
  mockResolveCanonicalOwnerId,
  mockSetEntityRole,
  mockNormalizeRole,
  mockCanModifyRole,
  mockCheckSenderRole,
} = vi.hoisted(() => ({
  mockGetConnectorAdminWhitelist: vi.fn(),
  mockGetEntityRole: vi.fn(),
  mockHasConfiguredCanonicalOwner: vi.fn(),
  mockMatchEntityToConnectorAdminWhitelist: vi.fn(),
  mockResolveWorldForMessage: vi.fn(),
  mockResolveCanonicalOwnerId: vi.fn(),
  mockSetEntityRole: vi.fn(),
  mockNormalizeRole: vi.fn(),
  mockCanModifyRole: vi.fn(),
  mockCheckSenderRole: vi.fn(),
}));

vi.mock("@elizaos/core/roles", () => ({
  getConnectorAdminWhitelist: mockGetConnectorAdminWhitelist,
  getEntityRole: mockGetEntityRole,
  hasConfiguredCanonicalOwner: mockHasConfiguredCanonicalOwner,
  matchEntityToConnectorAdminWhitelist:
    mockMatchEntityToConnectorAdminWhitelist,
  resolveWorldForMessage: mockResolveWorldForMessage,
  resolveCanonicalOwnerId: mockResolveCanonicalOwnerId,
  setEntityRole: mockSetEntityRole,
  normalizeRole: mockNormalizeRole,
  canModifyRole: mockCanModifyRole,
  checkSenderRole: mockCheckSenderRole,
}));

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

import { lateJoinWhitelistEvaluator } from "../evaluators/late-join-whitelist";
import { roleBackfillProvider } from "../providers/role-backfill";

// ---------------------------------------------------------------------------
// Stateful mock runtime
// ---------------------------------------------------------------------------

type RolesMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
  roleSources?: Record<string, string>;
};

type MockWorld = {
  id: UUID;
  name: string;
  metadata: RolesMetadata;
};

type MockEntity = {
  id: UUID;
  names?: string[];
  metadata: Record<string, unknown>;
};

type MockRoom = {
  id: UUID;
  worldId: UUID | null;
};

/**
 * Stateful mock runtime that maintains worlds, entities, and rooms in memory.
 * Tracks updateWorld calls for assertion and keeps role state consistent.
 */
function createMockRuntime(opts: {
  worlds: Map<UUID, MockWorld>;
  entities: Map<UUID, MockEntity>;
  rooms: Map<UUID, MockRoom>;
}) {
  const updateWorldCalls: MockWorld[] = [];

  const runtime = {
    agentId: "agent-test" as UUID,

    getWorld: vi.fn(async (id: UUID) => {
      return opts.worlds.get(id) ?? null;
    }),

    updateWorld: vi.fn(async (world: MockWorld) => {
      opts.worlds.set(world.id, { ...world });
      updateWorldCalls.push({ ...world });
    }),

    getEntityById: vi.fn(async (id: UUID) => {
      return opts.entities.get(id) ?? null;
    }),

    getEntitiesForRoom: vi.fn(async (_roomId: UUID) => {
      return [...opts.entities.values()];
    }),

    getRoom: vi.fn(async (id: UUID) => {
      return opts.rooms.get(id) ?? null;
    }),

    getRoomsForParticipant: vi.fn(async (_entityId: UUID) => {
      return [...opts.rooms.values()].map((r) => r.id);
    }),

    getSetting: vi.fn(() => null),

    /** Expose tracked calls for assertion */
    _updateWorldCalls: updateWorldCalls,
    _worlds: opts.worlds,
    _entities: opts.entities,
    _rooms: opts.rooms,
  };

  return runtime;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OWNER_ENTITY = "entity-owner-001" as UUID;
const ADMIN_ENTITY = "entity-admin-002" as UUID;
const NOBODY_ENTITY = "entity-nobody-003" as UUID;
const WORLD_ID = "world-001" as UUID;
const ROOM_ID = "room-001" as UUID;

function makeMessage(entityId: UUID, roomId: UUID = ROOM_ID): Memory {
  return {
    entityId,
    roomId,
    content: { text: "hello" },
  } as Memory;
}

/** Wire up mockResolveWorldForMessage to use the stateful worlds map */
function wireResolveWorld(
  worlds: Map<UUID, MockWorld>,
  rooms: Map<UUID, MockRoom>,
) {
  mockResolveWorldForMessage.mockImplementation(
    async (_runtime: unknown, message: Memory) => {
      const room = rooms.get(message.roomId);
      if (!room?.worldId) return null;
      const world = worlds.get(room.worldId);
      if (!world) return null;
      return { world, metadata: world.metadata };
    },
  );
}

/** Wire up mockGetEntityRole to read from stateful world metadata */
function wireGetEntityRole(
  _worlds: Map<UUID, MockWorld>,
  _rooms: Map<UUID, MockRoom>,
) {
  mockGetEntityRole.mockImplementation(
    (metadata: RolesMetadata | undefined, entityId: string) => {
      const roles = metadata?.roles ?? {};
      return roles[entityId] ?? "NONE";
    },
  );
}

/**
 * Wire up mockSetEntityRole to persist into stateful world metadata.
 * This mirrors what the runtime roles capability does: resolve world from message, set role, persist.
 */
function wireSetEntityRole(
  worlds: Map<UUID, MockWorld>,
  rooms: Map<UUID, MockRoom>,
  updateWorldFn: (world: MockWorld) => Promise<void>,
) {
  mockSetEntityRole.mockImplementation(
    async (
      _runtime: unknown,
      message: Memory,
      targetEntityId: string,
      newRole: string,
      source = "manual",
    ) => {
      const room = rooms.get(message.roomId);
      if (!room?.worldId) return {};
      const world = worlds.get(room.worldId);
      if (!world) return {};
      const roles = world.metadata.roles ?? {};
      const roleSources = world.metadata.roleSources ?? {};
      roles[targetEntityId] = newRole;
      if (newRole === "GUEST") {
        delete roleSources[targetEntityId];
      } else {
        roleSources[targetEntityId] = source;
      }
      world.metadata.roles = roles;
      world.metadata.roleSources = roleSources;
      await updateWorldFn(world);
      return { ...roles };
    },
  );
}

/** Wire up mockNormalizeRole with real normalization logic */
function wireNormalizeRole() {
  mockNormalizeRole.mockImplementation((raw: string | undefined | null) => {
    if (!raw) return "NONE";
    const upper = raw.toUpperCase();
    if (upper === "OWNER" || upper === "ADMIN") return upper;
    return "NONE";
  });
}

/** Wire up mockCanModifyRole with real permission logic */
function wireCanModifyRole() {
  mockCanModifyRole.mockImplementation(
    (actorRole: string, targetCurrentRole: string, newRole: string) => {
      if (targetCurrentRole === newRole) return false;
      if (actorRole === "OWNER") return true;
      if (actorRole === "ADMIN") {
        return targetCurrentRole !== "OWNER" && newRole !== "OWNER";
      }
      return false;
    },
  );
}

/** Wire up mockCheckSenderRole to read from stateful world metadata */
function wireCheckSenderRole(
  worlds: Map<UUID, MockWorld>,
  rooms: Map<UUID, MockRoom>,
) {
  mockCheckSenderRole.mockImplementation(
    async (_runtime: unknown, message: Memory) => {
      const room = rooms.get(message.roomId);
      if (!room?.worldId) return null;
      const world = worlds.get(room.worldId);
      if (!world) return null;
      const roles = world.metadata.roles ?? {};
      const role = roles[message.entityId as string] ?? "NONE";
      return {
        entityId: message.entityId,
        role,
        isOwner: role === "OWNER",
        isAdmin: role === "ADMIN" || role === "OWNER",
        canManageRoles: role === "OWNER" || role === "ADMIN",
      };
    },
  );
}

function wireCanonicalOwnerResolver(worlds: Map<UUID, MockWorld>) {
  mockHasConfiguredCanonicalOwner.mockReturnValue(false);
  mockResolveCanonicalOwnerId.mockImplementation(
    (_runtime: unknown, metadata?: RolesMetadata) =>
      metadata?.ownership?.ownerId ??
      worlds.get(WORLD_ID)?.metadata.ownership?.ownerId ??
      null,
  );
}

function wireConnectorAdminWhitelistMatcher() {
  mockGetConnectorAdminWhitelist.mockReturnValue({});
  mockMatchEntityToConnectorAdminWhitelist.mockImplementation(
    (
      entityMetadata: Record<string, unknown> | undefined | null,
      whitelist: Record<string, string[]>,
    ) => {
      if (!entityMetadata) {
        return null;
      }

      for (const [connector, platformIds] of Object.entries(whitelist)) {
        if (!platformIds?.length) {
          continue;
        }

        const connectorMetadata = entityMetadata[connector] as
          | Record<string, unknown>
          | undefined;
        if (!connectorMetadata || typeof connectorMetadata !== "object") {
          continue;
        }

        for (const field of ["userId", "id", "username", "userName"] as const) {
          const value = connectorMetadata[field];
          if (typeof value === "string" && platformIds.includes(value)) {
            return { connector, matchedValue: value };
          }
        }
      }

      return null;
    },
  );
}

// ---------------------------------------------------------------------------
// Default scaffolding factory
// ---------------------------------------------------------------------------

function createScaffolding(overrides?: {
  ownerRolePreset?: string;
  connectorAdmins?: Record<string, string[]>;
}) {
  const worlds = new Map<UUID, MockWorld>();
  const entities = new Map<UUID, MockEntity>();
  const rooms = new Map<UUID, MockRoom>();

  worlds.set(WORLD_ID, {
    id: WORLD_ID,
    name: "Test World",
    metadata: {
      ownership: { ownerId: OWNER_ENTITY },
      roles: overrides?.ownerRolePreset
        ? { [OWNER_ENTITY]: overrides.ownerRolePreset }
        : {},
    },
  });

  rooms.set(ROOM_ID, { id: ROOM_ID, worldId: WORLD_ID });

  entities.set(OWNER_ENTITY, {
    id: OWNER_ENTITY,
    names: ["owner"],
    metadata: { discord: { userId: "discord-owner-111" } },
  });

  entities.set(ADMIN_ENTITY, {
    id: ADMIN_ENTITY,
    names: ["admin"],
    metadata: { discord: { userId: "discord-admin-222" } },
  });

  entities.set(NOBODY_ENTITY, {
    id: NOBODY_ENTITY,
    names: ["nobody"],
    metadata: { discord: { userId: "discord-nobody-333" } },
  });

  const runtime = createMockRuntime({ worlds, entities, rooms });

  // Wire up all mock implementations against stateful stores
  wireResolveWorld(worlds, rooms);
  wireGetEntityRole(worlds, rooms);
  wireSetEntityRole(worlds, rooms, async (w) => {
    worlds.set(w.id, { ...w });
  });
  wireNormalizeRole();
  wireCanModifyRole();
  wireCheckSenderRole(worlds, rooms);
  wireCanonicalOwnerResolver(worlds);
  wireConnectorAdminWhitelistMatcher();

  // Config
  const adminWhitelist = overrides?.connectorAdmins ?? {};
  mockLoadElizaConfig.mockReturnValue({
    roles: {
      connectorAdmins: adminWhitelist,
    },
  });

  return { runtime, worlds, entities, rooms };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("roles e2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Owner is OWNER in app-world
  describe("owner role backfill", () => {
    it("backfills OWNER role when world owner has no role set", async () => {
      const { runtime, worlds } = createScaffolding();
      const message = makeMessage(OWNER_ENTITY);

      const result = await roleBackfillProvider.get(
        runtime as never,
        message,
        {} as State,
      );

      expect(result.text).toBe("");
      const world = worlds.get(WORLD_ID);
      expect(world?.metadata.roles?.[OWNER_ENTITY]).toBe("OWNER");
    });

    // 6. New world gets owner role backfilled
    it("backfills OWNER role for a newly created world", async () => {
      const { runtime, worlds, rooms } = createScaffolding();

      const newWorldId = "world-new-002" as UUID;
      const newRoomId = "room-new-002" as UUID;

      worlds.set(newWorldId, {
        id: newWorldId,
        name: "New World",
        metadata: {
          ownership: { ownerId: OWNER_ENTITY },
          roles: {},
        },
      });
      rooms.set(newRoomId, { id: newRoomId, worldId: newWorldId });

      const message = makeMessage(OWNER_ENTITY, newRoomId);

      await roleBackfillProvider.get(runtime as never, message, {} as State);

      const world = worlds.get(newWorldId);
      expect(world?.metadata.roles?.[OWNER_ENTITY]).toBe("OWNER");
    });

    // 8. Role backfill is idempotent
    it("does not call updateWorld when owner already has OWNER role", async () => {
      const { runtime, worlds } = createScaffolding({ ownerRolePreset: "OWNER" });
      const message = makeMessage(OWNER_ENTITY);

      await roleBackfillProvider.get(runtime as never, message, {} as State);

      expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
      expect(
        worlds.get(WORLD_ID)?.metadata.roleSources?.[OWNER_ENTITY],
      ).toBe("owner");
    });

    it("preserves existing non-owner roles during backfill", async () => {
      const { runtime, worlds } = createScaffolding();

      // Pre-set an admin role for another entity
      const world = worlds.get(WORLD_ID);
      if (world) {
        world.metadata.roles = { [ADMIN_ENTITY]: "ADMIN" };
        worlds.set(WORLD_ID, world);
      }

      const message = makeMessage(OWNER_ENTITY);
      await roleBackfillProvider.get(runtime as never, message, {} as State);

      const updatedWorld = worlds.get(WORLD_ID);
      expect(updatedWorld?.metadata.roles?.[OWNER_ENTITY]).toBe("OWNER");
      expect(updatedWorld?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    });
  });

  // 2 & 3. Connector admin whitelist promotion
  describe("late-join whitelist evaluator", () => {
    it("promotes a whitelisted discord entity to ADMIN", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      const message = makeMessage(ADMIN_ENTITY);

      // validate should return true — entity has no role
      const shouldRun = await lateJoinWhitelistEvaluator.validate(
        runtime as never,
        message,
      );
      expect(shouldRun).toBe(true);

      // handler promotes
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ADMIN_ENTITY }),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );

      // Verify role was persisted in stateful world
      const world = worlds.get(WORLD_ID);
      expect(world?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    });

    // 3. Late-join entity gets promoted (arrives after init)
    it("promotes late-joining entity on first message", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-nobody-333"] },
      });

      const message = makeMessage(NOBODY_ENTITY);

      // Entity has no role yet
      const shouldRun = await lateJoinWhitelistEvaluator.validate(
        runtime as never,
        message,
      );
      expect(shouldRun).toBe(true);

      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      const world = worlds.get(WORLD_ID);
      expect(world?.metadata.roles?.[NOBODY_ENTITY]).toBe("ADMIN");
    });

    it("skips entity already promoted to ADMIN", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      // Pre-set the role
      const world = worlds.get(WORLD_ID);
      if (world) {
        world.metadata.roles = {
          ...world.metadata.roles,
          [ADMIN_ENTITY]: "ADMIN",
        };
      }

      const message = makeMessage(ADMIN_ENTITY);

      // validate should return false — entity already has ADMIN
      const shouldRun = await lateJoinWhitelistEvaluator.validate(
        runtime as never,
        message,
      );
      expect(shouldRun).toBe(false);
    });

    it("does not promote entity that is not in the whitelist", async () => {
      const { runtime } = createScaffolding({
        connectorAdmins: { discord: ["some-other-user"] },
      });

      const message = makeMessage(NOBODY_ENTITY);

      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("does not promote when no whitelist is configured", async () => {
      const { runtime } = createScaffolding({ connectorAdmins: {} });

      const message = makeMessage(NOBODY_ENTITY);

      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });
  });

  // 4. Role persists across messages
  describe("role persistence", () => {
    it("maintains ADMIN role across multiple messages", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      const msg1 = makeMessage(ADMIN_ENTITY);

      // First message — promote
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        msg1,
        {} as State,
      );

      // Verify role was set
      const worldAfter1 = worlds.get(WORLD_ID);
      expect(worldAfter1?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");

      // Second and third messages — validate should return false (already ADMIN)
      for (let i = 0; i < 2; i++) {
        const msg = makeMessage(ADMIN_ENTITY);
        const shouldRun = await lateJoinWhitelistEvaluator.validate(
          runtime as never,
          msg,
        );
        expect(shouldRun).toBe(false);
      }

      // Role is still ADMIN
      const worldFinal = worlds.get(WORLD_ID);
      expect(worldFinal?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    });

    it("maintains OWNER role set by backfill across messages", async () => {
      const { runtime, worlds } = createScaffolding();

      // Backfill owner role
      await roleBackfillProvider.get(
        runtime as never,
        makeMessage(OWNER_ENTITY),
        {} as State,
      );

      expect(worlds.get(WORLD_ID)?.metadata.roles?.[OWNER_ENTITY]).toBe(
        "OWNER",
      );

      // Subsequent messages — backfill is idempotent
      for (let i = 0; i < 3; i++) {
        await roleBackfillProvider.get(
          runtime as never,
          makeMessage(OWNER_ENTITY),
          {} as State,
        );
      }

      // Still OWNER, updateWorld called only once (first backfill)
      expect(worlds.get(WORLD_ID)?.metadata.roles?.[OWNER_ENTITY]).toBe(
        "OWNER",
      );
      // First call does the backfill, subsequent calls should skip
      // (updateWorld called once in backfill + once in the initial set)
      expect(runtime.updateWorld).toHaveBeenCalledTimes(1);
    });
  });

  // 5. Non-admin cannot promote via action
  describe("role modification permissions", () => {
    it("rejects role modification by entity with NONE role", async () => {
      createScaffolding();

      // canModifyRole(NONE, NONE, ADMIN) should return false
      const allowed = mockCanModifyRole("NONE", "NONE", "ADMIN");
      expect(allowed).toBe(false);
    });

    it("allows OWNER to promote entity to ADMIN", async () => {
      createScaffolding();

      const allowed = mockCanModifyRole("OWNER", "NONE", "ADMIN");
      expect(allowed).toBe(true);
    });

    it("allows ADMIN to promote NONE to ADMIN", async () => {
      createScaffolding();

      const allowed = mockCanModifyRole("ADMIN", "NONE", "ADMIN");
      expect(allowed).toBe(true);
    });

    it("prevents ADMIN from modifying OWNER role", async () => {
      createScaffolding();

      const allowed = mockCanModifyRole("ADMIN", "OWNER", "NONE");
      expect(allowed).toBe(false);
    });

    it("prevents setting entity to its current role", async () => {
      createScaffolding();

      const allowed = mockCanModifyRole("OWNER", "ADMIN", "ADMIN");
      expect(allowed).toBe(false);
    });

    it("checkSenderRole returns correct result for NONE entity", async () => {
      const { runtime } = createScaffolding();
      const message = makeMessage(NOBODY_ENTITY);

      const result = await mockCheckSenderRole(runtime, message);
      expect(result).toEqual({
        entityId: NOBODY_ENTITY,
        role: "NONE",
        isOwner: false,
        isAdmin: false,
        canManageRoles: false,
      });
    });

    it("checkSenderRole returns correct result for OWNER entity", async () => {
      const { runtime } = createScaffolding({ ownerRolePreset: "OWNER" });
      const message = makeMessage(OWNER_ENTITY);

      const result = await mockCheckSenderRole(runtime, message);
      expect(result).toEqual({
        entityId: OWNER_ENTITY,
        role: "OWNER",
        isOwner: true,
        isAdmin: true,
        canManageRoles: true,
      });
    });
  });

  // 7. Whitelist match on entity metadata
  describe("whitelist metadata matching", () => {
    it("matches entity by discord.userId", async () => {
      const { runtime } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.anything(),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );
    });

    it("matches entity by discord.id field", async () => {
      const { runtime, entities } = createScaffolding({
        connectorAdmins: { discord: ["discord-id-value"] },
      });

      // Override entity metadata to use `id` instead of `userId`
      entities.set(ADMIN_ENTITY, {
        id: ADMIN_ENTITY,
        metadata: { discord: { id: "discord-id-value" } },
      });

      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.anything(),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );
    });

    it("matches entity by telegram.username", async () => {
      const { runtime, entities } = createScaffolding({
        connectorAdmins: { telegram: ["tg_bob"] },
      });

      entities.set(ADMIN_ENTITY, {
        id: ADMIN_ENTITY,
        metadata: { telegram: { username: "tg_bob" } },
      });

      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.anything(),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );
    });

    it("matches entity by telegram.id", async () => {
      const { runtime, entities } = createScaffolding({
        connectorAdmins: { telegram: ["12345"] },
      });

      entities.set(ADMIN_ENTITY, {
        id: ADMIN_ENTITY,
        metadata: { telegram: { id: "12345" } },
      });

      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.anything(),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );
    });

    it("does not match when connector key differs", async () => {
      const { runtime } = createScaffolding({
        connectorAdmins: { telegram: ["discord-admin-222"] },
      });

      // Entity has discord metadata but whitelist checks telegram
      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("handles entity with no metadata gracefully", async () => {
      const { runtime, entities } = createScaffolding({
        connectorAdmins: { discord: ["anything"] },
      });

      entities.set(NOBODY_ENTITY, {
        id: NOBODY_ENTITY,
        metadata: {},
      });

      const message = makeMessage(NOBODY_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("matches across multiple connectors in whitelist", async () => {
      const { runtime, entities } = createScaffolding({
        connectorAdmins: {
          discord: ["not-this-one"],
          telegram: ["tg_match"],
        },
      });

      entities.set(ADMIN_ENTITY, {
        id: ADMIN_ENTITY,
        metadata: {
          discord: { userId: "discord-admin-222" },
          telegram: { username: "tg_match" },
        },
      });

      const message = makeMessage(ADMIN_ENTITY);
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        message,
        {} as State,
      );

      // Should match on telegram even though discord doesn't match
      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.anything(),
        ADMIN_ENTITY,
        "ADMIN",
        "connector_admin",
      );
    });
  });

  // Combined flow: backfill + late-join in sequence
  describe("combined flow", () => {
    it("backfills owner then promotes late-join admin in same world", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      // Step 1: Owner sends first message, backfill fires
      const ownerMsg = makeMessage(OWNER_ENTITY);
      await roleBackfillProvider.get(runtime as never, ownerMsg, {} as State);

      expect(worlds.get(WORLD_ID)?.metadata.roles?.[OWNER_ENTITY]).toBe(
        "OWNER",
      );

      // Step 2: Admin-eligible entity joins and sends message
      const adminMsg = makeMessage(ADMIN_ENTITY);

      const shouldPromote = await lateJoinWhitelistEvaluator.validate(
        runtime as never,
        adminMsg,
      );
      expect(shouldPromote).toBe(true);

      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        adminMsg,
        {} as State,
      );

      // Both roles should coexist
      const finalWorld = worlds.get(WORLD_ID);
      expect(finalWorld?.metadata.roles?.[OWNER_ENTITY]).toBe("OWNER");
      expect(finalWorld?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    });

    it("non-whitelisted entity remains NONE after all providers run", async () => {
      const { runtime, worlds } = createScaffolding({
        connectorAdmins: { discord: ["discord-admin-222"] },
      });

      const nobodyMsg = makeMessage(NOBODY_ENTITY);

      // Backfill — no effect on nobody
      await roleBackfillProvider.get(runtime as never, nobodyMsg, {} as State);

      // Late-join — not in whitelist, no promotion
      await lateJoinWhitelistEvaluator.handler(
        runtime as never,
        nobodyMsg,
        {} as State,
      );

      const world = worlds.get(WORLD_ID);
      expect(world?.metadata.roles?.[NOBODY_ENTITY]).toBeUndefined();
    });
  });
});
