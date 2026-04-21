import type { Memory, State, UUID } from "@elizaos/core";
import { setConnectorAdminWhitelist } from "@elizaos/core/roles";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lateJoinWhitelistEvaluator } from "../evaluators/late-join-whitelist";
import { roleBackfillProvider } from "../providers/role-backfill";
import { updateRoleAction } from "../runtime/roles/src/action";

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

type RolesMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
  roleSources?: Record<string, string>;
};

type MockWorld = {
  id: UUID;
  metadata: RolesMetadata;
};

type MockEntity = {
  id: UUID;
  names: string[];
  metadata: Record<string, unknown>;
};

type MockRoom = {
  id: UUID;
  worldId: UUID | null;
};

const OWNER_ENTITY = "entity-owner-001" as UUID;
const ADMIN_ENTITY = "entity-admin-002" as UUID;
const NOBODY_ENTITY = "entity-nobody-003" as UUID;
const WORLD_A = "world-a" as UUID;
const WORLD_B = "world-b" as UUID;
const ROOM_A = "room-a" as UUID;
const ROOM_B = "room-b" as UUID;

function createRuntime(opts: {
  worlds: Map<UUID, MockWorld>;
  entities: Map<UUID, MockEntity>;
  rooms: Map<UUID, MockRoom>;
}) {
  const settings = new Map<string, string | boolean | number | null>();
  return {
    agentId: "agent-test" as UUID,
    getRoom: vi.fn(async (id: UUID) => opts.rooms.get(id) ?? null),
    getWorld: vi.fn(async (id: UUID) => opts.worlds.get(id) ?? null),
    updateWorld: vi.fn(async (world: MockWorld) => {
      opts.worlds.set(world.id, { ...world });
    }),
    getEntityById: vi.fn(async (id: UUID) => opts.entities.get(id) ?? null),
    getEntitiesForRoom: vi.fn(async (_roomId: UUID) => [...opts.entities.values()]),
    getRoomsForParticipant: vi.fn(async (_entityId: UUID) => [...opts.rooms.keys()]),
    getRelationships: vi.fn(async () => []),
    getSetting: vi.fn((key: string) => settings.get(key) ?? null),
    setSetting: vi.fn((key: string, value: unknown) => {
      if (value === null || value === undefined) {
        settings.delete(key);
        return;
      }
      settings.set(key, value as string | boolean | number | null);
    }),
  } as never;
}

function makeMessage(
  entityId: UUID,
  text: string,
  roomId: UUID = ROOM_A,
  metadata?: Record<string, unknown>,
): Memory {
  return {
    entityId,
    roomId,
    content: {
      text,
      ...(metadata ? { metadata } : {}),
    },
  } as Memory;
}

function createScaffolding() {
  const worlds = new Map<UUID, MockWorld>([
    [
      WORLD_A,
      {
        id: WORLD_A,
        metadata: {
          ownership: { ownerId: OWNER_ENTITY },
          roles: {},
        },
      },
    ],
    [
      WORLD_B,
      {
        id: WORLD_B,
        metadata: {
          ownership: { ownerId: OWNER_ENTITY },
          roles: {},
        },
      },
    ],
  ]);

  const rooms = new Map<UUID, MockRoom>([
    [ROOM_A, { id: ROOM_A, worldId: WORLD_A }],
    [ROOM_B, { id: ROOM_B, worldId: WORLD_B }],
  ]);

  const entities = new Map<UUID, MockEntity>([
    [
      OWNER_ENTITY,
      {
        id: OWNER_ENTITY,
        names: ["owner"],
        metadata: { discord: { userId: "discord-owner-111" } },
      },
    ],
    [
      ADMIN_ENTITY,
      {
        id: ADMIN_ENTITY,
        names: ["admin"],
        metadata: { discord: { userId: "discord-admin-222" } },
      },
    ],
    [
      NOBODY_ENTITY,
      {
        id: NOBODY_ENTITY,
        names: ["nobody"],
        metadata: { discord: { userId: "discord-nobody-333" } },
      },
    ],
  ]);

  return {
    worlds,
    rooms,
    entities,
    runtime: createRuntime({ worlds, rooms, entities }),
  };
}

describe("roles command e2e", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadElizaConfig.mockReturnValue({});
  });

  it("backfills owner, promotes late-join admin, then allows UPDATE_ROLE in one flow", async () => {
    const { runtime, worlds } = createScaffolding();
    mockLoadElizaConfig.mockReturnValue({
      roles: {
        connectorAdmins: { discord: ["discord-admin-222"] },
      },
    });

    await roleBackfillProvider.get(
      runtime,
      makeMessage(OWNER_ENTITY, "hello from owner"),
      {} as State,
    );
    await lateJoinWhitelistEvaluator.handler(
      runtime,
      makeMessage(ADMIN_ENTITY, "hello from admin"),
      {} as State,
    );

    const callback = vi.fn();
    const result = await updateRoleAction.handler(
      runtime,
      makeMessage(ADMIN_ENTITY, "/role @nobody USER"),
      {} as never,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(worlds.get(WORLD_A)?.metadata.roles?.[OWNER_ENTITY]).toBe("OWNER");
    expect(worlds.get(WORLD_A)?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    expect(worlds.get(WORLD_A)?.metadata.roles?.[NOBODY_ENTITY]).toBe("USER");
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Updated nobody's role"),
      }),
    );
  });

  it("rejects outsider attempts to spoof connector-admin rights via content metadata", async () => {
    const { runtime, worlds } = createScaffolding();
    mockLoadElizaConfig.mockReturnValue({
      roles: {
        connectorAdmins: { discord: ["discord-admin-222"] },
      },
    });

    const callback = vi.fn();
    const result = await updateRoleAction.handler(
      runtime,
      makeMessage(NOBODY_ENTITY, "/role @admin USER", ROOM_A, {
        discord: { userId: "discord-admin-222", username: "admin" },
      }),
      {} as never,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(worlds.get(WORLD_A)?.metadata.roles?.[ADMIN_ENTITY]).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("don't have permission"),
      }),
    );
  });

  it("promotes late-join admins from the runtime whitelist even without config-file state", async () => {
    const { runtime, worlds } = createScaffolding();
    setConnectorAdminWhitelist(runtime, {
      discord: ["discord-admin-222"],
    });

    await lateJoinWhitelistEvaluator.handler(
      runtime,
      makeMessage(ADMIN_ENTITY, "hello from admin"),
      {} as State,
    );

    expect(worlds.get(WORLD_A)?.metadata.roles?.[ADMIN_ENTITY]).toBe("ADMIN");
    expect(worlds.get(WORLD_A)?.metadata.roleSources?.[ADMIN_ENTITY]).toBe(
      "connector_admin",
    );
  });

  it("keeps roles world-scoped so admin in one world cannot manage another world", async () => {
    const { runtime, worlds } = createScaffolding();

    worlds.get(WORLD_A)!.metadata.roles = { [ADMIN_ENTITY]: "ADMIN" };
    worlds.get(WORLD_B)!.metadata.roles = {};

    const callback = vi.fn();
    const result = await updateRoleAction.handler(
      runtime,
      makeMessage(ADMIN_ENTITY, "/role @nobody USER", ROOM_B),
      {} as never,
      undefined,
      callback,
    );

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(worlds.get(WORLD_B)?.metadata.roles?.[NOBODY_ENTITY]).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("don't have permission"),
      }),
    );
  });
});
