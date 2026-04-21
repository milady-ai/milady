import type { IAgentRuntime, Memory, Relationship, UUID } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { getSelfControlAccess, SELFCONTROL_ACCESS_ERROR } from "./access";

function createRuntimeMock(options: {
  room?: { worldId: string | null } | null;
  world?: {
    id: string;
    metadata?: {
      ownership?: { ownerId?: string };
      roles?: Record<string, string>;
    } | null;
  } | null;
  entities?: Record<string, { metadata?: Record<string, unknown> }>;
  relationships?: Relationship[];
  settings?: Record<string, string | boolean | number | null>;
}): IAgentRuntime {
  return {
    getRoom: vi.fn().mockResolvedValue(options.room ?? null),
    getWorld: vi.fn().mockResolvedValue(options.world ?? null),
    getEntityById: vi.fn().mockImplementation(async (id: string) => {
      const entity = options.entities?.[id];
      if (!entity) return null;
      return {
        id,
        metadata: entity.metadata ?? {},
      };
    }),
    getRelationships: vi.fn().mockResolvedValue(options.relationships ?? []),
    getSetting: vi.fn().mockImplementation((key: string) => {
      return options.settings?.[key] ?? null;
    }),
  } as unknown as IAgentRuntime;
}

function createMessage(
  entityId: string,
  memoryMetadata?: Record<string, unknown>,
): Memory {
  return {
    entityId: entityId as UUID,
    roomId: "room-1" as UUID,
    content: {
      text: "block x.com",
      source:
        typeof memoryMetadata?.discordServerId === "string"
          ? "discord"
          : undefined,
    },
    ...(memoryMetadata ? { metadata: memoryMetadata } : {}),
  } as Memory;
}

describe("getSelfControlAccess", () => {
  it("allows the stored world owner even when roles have not been backfilled yet", async () => {
    const runtime = createRuntimeMock({
      room: { worldId: "world-1" },
      world: {
        id: "world-1",
        metadata: {
          ownership: { ownerId: "owner-1" },
          roles: {},
        },
      },
    });

    await expect(
      getSelfControlAccess(runtime, createMessage("owner-1")),
    ).resolves.toEqual({
      allowed: true,
      role: "OWNER",
    });
  });

  it("allows a Discord sender whose connector identity matches the stored owner entity", async () => {
    const runtime = createRuntimeMock({
      room: { worldId: "world-1" },
      world: {
        id: "world-1",
        metadata: {
          ownership: { ownerId: "app-owner" },
          roles: {},
        },
      },
      entities: {
        "app-owner": {
          metadata: {
            discord: { userId: "discord-owner-111" },
          },
        },
      },
    });

    await expect(
      getSelfControlAccess(
        runtime,
        createMessage("discord-shadow", {
          fromId: "discord-owner-111",
          discordServerId: "guild-1",
        }),
      ),
    ).resolves.toEqual({
      allowed: true,
      role: "OWNER",
    });
  });

  it("allows a Telegram sender whose connector identity matches the canonical owner entity", async () => {
    const runtime = createRuntimeMock({
      room: { worldId: "world-1" },
      world: {
        id: "world-1",
        metadata: {
          ownership: { ownerId: "app-owner" },
          roles: {},
        },
      },
      entities: {
        "app-owner": {
          metadata: {
            telegram: { id: "777777", username: "shaw_w" },
          },
        },
        "telegram-shadow": {
          metadata: {
            telegram: { id: "777777", username: "shaw_w" },
          },
        },
      },
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "app-owner",
      },
    });

    await expect(
      getSelfControlAccess(runtime, createMessage("telegram-shadow")),
    ).resolves.toEqual({
      allowed: true,
      role: "OWNER",
    });
  });

  it("still denies an unrelated sender", async () => {
    const runtime = createRuntimeMock({
      room: { worldId: "world-1" },
      world: {
        id: "world-1",
        metadata: {
          ownership: { ownerId: "owner-1" },
          roles: {},
        },
      },
    });

    await expect(
      getSelfControlAccess(runtime, createMessage("random-user")),
    ).resolves.toEqual({
      allowed: false,
      role: "GUEST",
      reason: SELFCONTROL_ACCESS_ERROR,
    });
  });

  it("denies a stale connector-local OWNER when a different canonical owner is configured", async () => {
    const runtime = createRuntimeMock({
      room: { worldId: "world-1" },
      world: {
        id: "world-1",
        metadata: {
          ownership: { ownerId: "discord-guild-owner" },
          roles: { "discord-guild-owner": "OWNER" },
        },
      },
      settings: {
        ELIZA_ADMIN_ENTITY_ID: "app-owner",
      },
    });

    await expect(
      getSelfControlAccess(runtime, createMessage("discord-guild-owner")),
    ).resolves.toEqual({
      allowed: false,
      role: "GUEST",
      reason: SELFCONTROL_ACCESS_ERROR,
    });
  });
});
