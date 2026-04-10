import type { Entity, IAgentRuntime, Room, UUID, World } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createNativeRelationshipsGraphService } from "./relationships-graph.js";

type ContactLike = {
  entityId: UUID;
  categories?: string[];
  tags?: string[];
  preferences?: {
    preferredCommunicationChannel?: string;
  };
  customFields?: Record<string, unknown>;
  lastModified?: string;
};

const roomId = "room-1" as UUID;
const worldId = "world-1" as UUID;

function createGraphRuntime(args: {
  entities: Entity[];
  messages: Array<{
    id: UUID;
    entityId: UUID;
    roomId: UUID;
    content: { text: string; inReplyTo?: UUID };
    createdAt: number;
  }>;
  relationships?: Array<{
    id?: UUID;
    sourceEntityId: UUID;
    targetEntityId: UUID;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }>;
  settings?: Record<string, string>;
  services?: Record<string, unknown>;
}) {
  const entitiesById = new Map(
    args.entities.map((entity) => [entity.id, entity]),
  );
  const room: Room = {
    id: roomId,
    name: "General",
    worldId,
    source: "discord",
    type: "GROUP",
    channelId: "general",
    createdAt: Date.now(),
  } as Room;
  const world: World = {
    id: worldId,
    name: "Workspace",
    agentId: "agent-1" as UUID,
    serverId: "server-1",
    createdAt: Date.now(),
  } as World;

  const runtime = {
    agentId: "agent-1" as UUID,
    getSetting: vi.fn((key: string) => args.settings?.[key] ?? null),
    getService: vi.fn(
      (serviceType: string) => args.services?.[serviceType] ?? null,
    ),
    getAllWorlds: vi.fn(async () => [world]),
    getRoomsByWorlds: vi.fn(async () => [room]),
    getEntitiesForRoom: vi.fn(async () => args.entities),
    getEntityById: vi.fn(
      async (entityId: UUID) => entitiesById.get(entityId) ?? null,
    ),
    getRelationships: vi.fn(async () => args.relationships ?? []),
    getMemories: vi.fn(
      async ({
        tableName,
        roomId: memoryRoomId,
      }: {
        tableName: string;
        roomId?: UUID;
      }) => {
        if (tableName === "messages" && memoryRoomId === roomId) {
          return args.messages;
        }
        return [];
      },
    ),
  } as unknown as IAgentRuntime;

  return { runtime };
}

function createRelationshipsService(contacts: ContactLike[]) {
  return {
    searchContacts: vi.fn(async () => contacts),
    getContact: vi.fn(
      async (entityId: UUID) =>
        contacts.find((contact) => contact.entityId === entityId) ?? null,
    ),
  };
}

describe("relationships-graph", () => {
  it("collects contact nicknames and links matching platform claims across entities", async () => {
    const discordEntityId = "person-discord" as UUID;
    const githubEntityId = "person-github" as UUID;
    const charlieEntityId = "person-charlie" as UUID;
    const { runtime } = createGraphRuntime({
      entities: [
        {
          agentId: "agent-1" as UUID,
          id: discordEntityId,
          names: ["casey_discord"],
          metadata: {
            platformIdentities: [{ platform: "discord", handle: "caseyd" }],
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: githubEntityId,
          names: ["octo-cat"],
          metadata: {
            github: { username: "octo-cat" },
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: charlieEntityId,
          names: ["Charlie"],
          metadata: {},
        } as Entity,
      ],
      messages: [
        {
          id: "message-1" as UUID,
          entityId: discordEntityId,
          roomId,
          content: { text: "Hey Charlie" },
          createdAt: 1,
        },
        {
          id: "message-2" as UUID,
          entityId: charlieEntityId,
          roomId,
          content: { text: "Hey Casey", inReplyTo: "message-1" as UUID },
          createdAt: 2,
        },
      ],
    });
    const relationshipsService = createRelationshipsService([
      {
        entityId: discordEntityId,
        customFields: {
          displayName: "Casey",
          nickname: "KC",
          githubUsername: "octo-cat",
        },
        preferences: {
          preferredCommunicationChannel: "discord",
        },
        lastModified: "2026-04-09T20:00:00.000Z",
      },
    ]);

    const service = createNativeRelationshipsGraphService(
      runtime,
      relationshipsService,
    );

    const snapshot = await service.getGraphSnapshot();
    const matchingSearch = await service.getGraphSnapshot({ search: "kc" });
    const casey = snapshot.people.find(
      (person) => person.displayName === "Casey",
    );

    expect(snapshot.people).toHaveLength(2);
    expect(casey).toMatchObject({
      displayName: "Casey",
      primaryEntityId: discordEntityId,
      memberEntityIds: expect.arrayContaining([
        discordEntityId,
        githubEntityId,
      ]),
      aliases: expect.arrayContaining(["KC", "casey_discord", "octo-cat"]),
      platforms: expect.arrayContaining(["discord", "github"]),
    });
    expect(
      casey?.identities.flatMap((identity) =>
        identity.handles.map((handle) => `${handle.platform}:${handle.handle}`),
      ),
    ).toEqual(expect.arrayContaining(["discord:caseyd", "github:octo-cat"]));
    expect(matchingSearch.people).toHaveLength(1);
    expect(matchingSearch.people[0]?.displayName).toBe("Casey");
  });

  it("normalizes legacy x handles into twitter identities when clustering", async () => {
    const xEntityId = "person-x" as UUID;
    const twitterEntityId = "person-twitter" as UUID;
    const charlieEntityId = "person-charlie-2" as UUID;
    const { runtime } = createGraphRuntime({
      entities: [
        {
          agentId: "agent-1" as UUID,
          id: xEntityId,
          names: ["casey-x"],
          metadata: {
            platformIdentities: [{ platform: "x", handle: "@casey" }],
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: twitterEntityId,
          names: ["casey-twitter"],
          metadata: {},
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: charlieEntityId,
          names: ["Charlie"],
          metadata: {},
        } as Entity,
      ],
      messages: [
        {
          id: "message-3" as UUID,
          entityId: xEntityId,
          roomId,
          content: { text: "checking in" },
          createdAt: 10,
        },
        {
          id: "message-4" as UUID,
          entityId: charlieEntityId,
          roomId,
          content: { text: "roger that", inReplyTo: "message-3" as UUID },
          createdAt: 11,
        },
      ],
    });
    const relationshipsService = createRelationshipsService([
      {
        entityId: twitterEntityId,
        customFields: {
          twitterHandle: "@casey",
          nickname: "Casey Bird",
        },
      },
    ]);

    const service = createNativeRelationshipsGraphService(
      runtime,
      relationshipsService,
    );

    const snapshot = await service.getGraphSnapshot({ platform: "twitter" });
    const casey = snapshot.people.find((person) =>
      person.memberEntityIds.includes(xEntityId),
    );

    expect(snapshot.people).toHaveLength(1);
    expect(casey?.memberEntityIds).toEqual(
      expect.arrayContaining([xEntityId, twitterEntityId]),
    );
    expect(casey?.platforms).toContain("twitter");
    expect(casey?.displayName).toBe("Casey Bird");
  });

  it("marks the canonical owner and exposes internal plus connector profiles", async () => {
    const ownerEntityId = "owner-canonical" as UUID;
    const teammateEntityId = "person-teammate" as UUID;
    const { runtime } = createGraphRuntime({
      entities: [
        {
          agentId: "agent-1" as UUID,
          id: ownerEntityId,
          names: ["shawmakesmagic"],
          metadata: {
            discord: {
              id: "498273781589213185",
              userId: "498273781589213185",
              username: "shawmakesmagic",
              globalName: "Shaw Walters",
              avatarUrl: "https://cdn.example.invalid/shaw.png",
            },
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: teammateEntityId,
          names: ["teammate"],
          metadata: {},
        } as Entity,
      ],
      messages: [
        {
          id: "message-owner-1" as UUID,
          entityId: ownerEntityId,
          roomId,
          content: { text: "owner ping" },
          createdAt: 20,
        },
        {
          id: "message-owner-2" as UUID,
          entityId: teammateEntityId,
          roomId,
          content: { text: "reply", inReplyTo: "message-owner-1" as UUID },
          createdAt: 21,
        },
      ],
      settings: {
        ELIZA_ADMIN_ENTITY_ID: ownerEntityId,
      },
      services: {
        CLOUD_AUTH: {
          getUserId: () => "ec-user-123",
        },
      },
    });
    const relationshipsService = createRelationshipsService([]);

    const service = createNativeRelationshipsGraphService(
      runtime,
      relationshipsService,
    );

    const snapshot = await service.getGraphSnapshot();
    const owner = snapshot.people.find(
      (person) => person.primaryEntityId === ownerEntityId,
    );

    expect(owner).toMatchObject({
      displayName: "shawmakesmagic",
      isOwner: true,
      platforms: expect.arrayContaining([
        "client_chat",
        "discord",
        "elizacloud",
      ]),
    });
    expect(owner?.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "client_chat",
          userId: ownerEntityId,
          canonical: true,
        }),
        expect.objectContaining({
          source: "discord",
          userId: "498273781589213185",
          handle: "shawmakesmagic",
        }),
        expect.objectContaining({
          source: "elizacloud",
          userId: "ec-user-123",
          canonical: true,
        }),
      ]),
    );
  });

  it("prefers the canonical owner when a stale connector identity is clustered into the same person", async () => {
    const ownerEntityId = "owner-live" as UUID;
    const staleDiscordEntityId = "owner-discord-legacy" as UUID;
    const teammateEntityId = "person-teammate-2" as UUID;
    const { runtime } = createGraphRuntime({
      entities: [
        {
          agentId: "agent-1" as UUID,
          id: ownerEntityId,
          names: ["shaw"],
          metadata: {
            discord: {
              id: "498273781589213185",
              userId: "498273781589213185",
              username: "shawmakesmagic",
              globalName: "Shaw",
            },
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: staleDiscordEntityId,
          names: ["shawmakesmagic"],
          metadata: {
            discord: {
              id: "498273781589213185",
              userId: "498273781589213185",
              username: "shawmakesmagic",
              globalName: "Shaw",
            },
          },
        } as Entity,
        {
          agentId: "agent-1" as UUID,
          id: teammateEntityId,
          names: ["teammate"],
          metadata: {},
        } as Entity,
      ],
      messages: [
        {
          id: "message-owner-live-1" as UUID,
          entityId: ownerEntityId,
          roomId,
          content: { text: "owner ping" },
          createdAt: 40,
        },
        {
          id: "message-owner-live-2" as UUID,
          entityId: teammateEntityId,
          roomId,
          content: { text: "reply", inReplyTo: "message-owner-live-1" as UUID },
          createdAt: 41,
        },
      ],
      settings: {
        ELIZA_ADMIN_ENTITY_ID: ownerEntityId,
      },
    });
    const relationshipsService = createRelationshipsService([]);

    const service = createNativeRelationshipsGraphService(
      runtime,
      relationshipsService,
    );

    const snapshot = await service.getGraphSnapshot();
    const owner = snapshot.people.find((person) => person.isOwner);

    expect(owner).toMatchObject({
      primaryEntityId: ownerEntityId,
      groupId: ownerEntityId,
      memberEntityIds: expect.arrayContaining([
        ownerEntityId,
        staleDiscordEntityId,
      ]),
      platforms: expect.arrayContaining(["client_chat", "discord"]),
    });
    expect(owner?.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "client_chat",
          userId: ownerEntityId,
          canonical: true,
        }),
        expect.objectContaining({
          source: "discord",
          userId: "498273781589213185",
          handle: "shawmakesmagic",
        }),
      ]),
    );
  });

  it("keeps the canonical owner visible even without relationship edges", async () => {
    const ownerEntityId = "owner-solo" as UUID;
    const { runtime } = createGraphRuntime({
      entities: [
        {
          agentId: "agent-1" as UUID,
          id: ownerEntityId,
          names: ["shaw"],
          metadata: {},
        } as Entity,
      ],
      messages: [
        {
          id: "message-owner-solo" as UUID,
          entityId: ownerEntityId,
          roomId,
          content: { text: "just me here" },
          createdAt: 30,
        },
      ],
      settings: {
        ELIZA_ADMIN_ENTITY_ID: ownerEntityId,
      },
    });
    const relationshipsService = createRelationshipsService([]);

    const service = createNativeRelationshipsGraphService(
      runtime,
      relationshipsService,
    );

    const snapshot = await service.getGraphSnapshot();

    expect(snapshot.people).toMatchObject([
      expect.objectContaining({
        primaryEntityId: ownerEntityId,
        isOwner: true,
      }),
    ]);
  });
});
