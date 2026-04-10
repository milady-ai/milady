import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole, mockResolveCanonicalOwnerIdForMessage } =
  vi.hoisted(() => ({
    mockCheckSenderRole: vi.fn(),
    mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  }));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: mockCheckSenderRole,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { searchEntityAction, readEntityAction } from "./entity-actions";

const mockGetGraphSnapshot = vi.fn();
const mockGetPersonDetail = vi.fn();

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getService: vi.fn().mockReturnValue({
      getGraphSnapshot: mockGetGraphSnapshot,
      getPersonDetail: mockGetPersonDetail,
    }),
    ...overrides,
  } as never;
}

function makeAdminMessage() {
  return {
    entityId: "owner-1",
    roomId: "room-1",
    content: { text: "find user", source: "client_chat" },
  } as never;
}

describe("searchEntityAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockGetGraphSnapshot.mockReset();
    mockGetPersonDetail.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
  });

  it("has correct metadata", () => {
    expect(searchEntityAction.name).toBe("SEARCH_ENTITY");
    expect(searchEntityAction.parameters?.length).toBeGreaterThan(0);
  });

  it("rejects empty query", async () => {
    const result = (await searchEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: {} } as never,
    )) as unknown as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.text).toContain("requires a non-empty query");
  });

  it("returns search results", async () => {
    mockGetGraphSnapshot.mockResolvedValue({
      people: [
        {
          groupId: "g1",
          primaryEntityId: "e1",
          memberEntityIds: ["e1"],
          displayName: "Alice",
          aliases: ["alice_dev"],
          platforms: ["discord"],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: null,
          categories: [],
          tags: [],
          factCount: 3,
          relationshipCount: 1,
        },
      ],
      relationships: [],
      stats: { totalPeople: 1, totalRelationships: 1, totalIdentities: 1 },
    });

    const result = (await searchEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: { query: "Alice" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("discord");
    expect(result.text).toContain("READ_ENTITY");
  });

  it("returns empty when no matches", async () => {
    mockGetGraphSnapshot.mockResolvedValue({
      people: [],
      relationships: [],
      stats: { totalPeople: 0, totalRelationships: 0, totalIdentities: 0 },
    });

    const result = (await searchEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: { query: "nobody" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("No contacts found");
  });
});

describe("readEntityAction", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockGetGraphSnapshot.mockReset();
    mockGetPersonDetail.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-1");
  });

  it("has correct metadata", () => {
    expect(readEntityAction.name).toBe("READ_ENTITY");
  });

  it("rejects when no entityId or name", async () => {
    const result = (await readEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: {} } as never,
    )) as unknown as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.text).toContain("requires either entityId or name");
  });

  it("returns full person detail by entityId", async () => {
    mockGetPersonDetail.mockResolvedValue({
      groupId: "g1",
      primaryEntityId: "e1",
      memberEntityIds: ["e1"],
      displayName: "Alice",
      aliases: [],
      platforms: ["discord", "telegram"],
      identities: [],
      emails: ["alice@example.com"],
      phones: [],
      websites: [],
      preferredCommunicationChannel: "telegram",
      categories: [],
      tags: [],
      factCount: 2,
      relationshipCount: 1,
      facts: [
        { id: "f1", sourceType: "claim", text: "Works at Acme Corp" },
        { id: "f2", sourceType: "memory", text: "Likes TypeScript", confidence: 0.9 },
      ],
      recentConversations: [
        {
          roomId: "r1",
          roomName: "#general",
          lastActivityAt: "2026-04-09T12:00:00Z",
          messages: [
            { id: "m1", speaker: "Alice", text: "hey", createdAt: Date.now() },
          ],
        },
      ],
      relationships: [
        {
          id: "rel1",
          sourcePersonId: "e1",
          targetPersonId: "e2",
          sourcePersonName: "Alice",
          targetPersonName: "Bob",
          relationshipTypes: ["colleague"],
          sentiment: "positive",
          strength: 0.8,
          interactionCount: 15,
          rawRelationshipIds: [],
        },
      ],
      identityEdges: [],
    });

    const result = (await readEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: { entityId: "e1" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("Works at Acme Corp");
    expect(result.text).toContain("Likes TypeScript");
    expect(result.text).toContain("90%");
    expect(result.text).toContain("#general");
    expect(result.text).toContain("Bob");
    expect(result.text).toContain("colleague");
    expect(result.text).toContain("scratchpad");
  });

  it("resolves by name when entityId not provided", async () => {
    mockGetGraphSnapshot.mockResolvedValue({
      people: [
        {
          primaryEntityId: "e1",
          displayName: "Alice",
          platforms: ["discord"],
        },
      ],
    });

    mockGetPersonDetail.mockResolvedValue({
      primaryEntityId: "e1",
      displayName: "Alice",
      aliases: [],
      platforms: ["discord"],
      identities: [],
      emails: [],
      phones: [],
      websites: [],
      preferredCommunicationChannel: null,
      categories: [],
      tags: [],
      factCount: 0,
      relationshipCount: 0,
      facts: [],
      recentConversations: [],
      relationships: [],
      identityEdges: [],
    });

    const result = (await readEntityAction.handler?.(
      makeRuntime(),
      makeAdminMessage(),
      {} as never,
      { parameters: { name: "Alice" } } as never,
    )) as unknown as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.text).toContain("Alice");
    expect(mockGetGraphSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ search: "Alice" }),
    );
  });
});
