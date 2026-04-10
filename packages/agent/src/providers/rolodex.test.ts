import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

import type { UUID } from "@elizaos/core";
import { rolodexProvider } from "./rolodex";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getService: vi.fn().mockReturnValue(null),
    ...overrides,
  } as never;
}

function makeMessage() {
  return {
    entityId: "user-1",
    roomId: "room-1",
    content: { text: "who do I know?", source: "client_chat" },
  } as never;
}

describe("rolodexProvider", () => {
  it("returns empty when relationships service not available", async () => {
    const runtime = makeRuntime();
    const result = await rolodexProvider.get(runtime, makeMessage(), {} as never);
    expect(result.text).toBe("");
  });

  it("returns 'no contacts' when graph is empty", async () => {
    const runtime = makeRuntime({
      getService: vi.fn().mockReturnValue({
        getGraphSnapshot: vi.fn().mockResolvedValue({
          people: [],
          relationships: [],
          stats: { totalPeople: 0, totalRelationships: 0, totalIdentities: 0 },
        }),
      }),
    });

    const result = await rolodexProvider.get(runtime, makeMessage(), {} as never);
    expect(result.text).toContain("No known contacts");
    expect(result.values).toHaveProperty("rolodexCount", 0);
  });

  it("formats contacts from relationships graph", async () => {
    const runtime = makeRuntime({
      getService: vi.fn().mockReturnValue({
        getGraphSnapshot: vi.fn().mockResolvedValue({
          people: [
            {
              groupId: "g1",
              primaryEntityId: "e1",
              memberEntityIds: ["e1"],
              displayName: "Alice",
              aliases: ["alice_dev"],
              platforms: ["discord", "telegram"],
              identities: [],
              emails: [],
              phones: [],
              websites: [],
              preferredCommunicationChannel: "telegram",
              categories: [],
              tags: [],
              factCount: 5,
              relationshipCount: 2,
              lastInteractionAt: "2026-04-09T12:00:00Z",
            },
          ],
          relationships: [],
          stats: { totalPeople: 1, totalRelationships: 2, totalIdentities: 3 },
        }),
      }),
    });

    const result = await rolodexProvider.get(runtime, makeMessage(), {} as never);
    expect(result.text).toContain("Rolodex");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("discord, telegram");
    expect(result.text).toContain("prefers: telegram");
    expect(result.values).toHaveProperty("rolodexCount", 1);
  });

  it("has correct metadata", () => {
    expect(rolodexProvider.name).toBe("rolodex");
    expect(rolodexProvider.dynamic).toBe(true);
    expect(rolodexProvider.position).toBe(7);
  });
});
