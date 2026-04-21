import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { describe, expect, test, vi } from "vitest";
import {
  findProximityPairs,
  updateProximityRelationships,
} from "./conversation-proximity";

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

const AGENT_ID = uuid(1);
const ROOM_ID = uuid(100);
const USER_A = uuid(10);
const USER_B = uuid(20);
const USER_C = uuid(30);

function buildMessage(
  entityId: UUID,
  roomId: UUID,
  createdAt = Date.now(),
): Memory {
  return {
    id: uuid(Math.floor(Math.random() * 99999)),
    entityId,
    agentId: AGENT_ID,
    roomId,
    content: { text: "hello" },
    createdAt,
  } as unknown as Memory;
}

describe("conversation-proximity", () => {
  describe("findProximityPairs", () => {
    test("finds pairs between sender and recent co-participants", async () => {
      const now = Date.now();
      const getMemoriesMock = vi.fn(async () => [
        buildMessage(USER_B, ROOM_ID, now - 30_000),
        buildMessage(USER_C, ROOM_ID, now - 60_000),
        buildMessage(USER_A, ROOM_ID, now - 90_000),
      ]);
      const runtime = {
        agentId: AGENT_ID,
        getMemories: getMemoriesMock,
      } as unknown as IAgentRuntime;

      const message = buildMessage(USER_A, ROOM_ID, now);
      const pairs = await findProximityPairs(runtime, message);

      expect(pairs).toHaveLength(2);
      const entityIds = pairs.flatMap((p) => [p.entityA, p.entityB]);
      expect(entityIds).toContain(USER_B);
      expect(entityIds).toContain(USER_C);
    });

    test("skips agent messages", async () => {
      const now = Date.now();
      const getMemoriesMock = vi.fn(async () => [
        buildMessage(AGENT_ID, ROOM_ID, now - 10_000),
        buildMessage(USER_B, ROOM_ID, now - 20_000),
      ]);
      const runtime = {
        agentId: AGENT_ID,
        getMemories: getMemoriesMock,
      } as unknown as IAgentRuntime;

      const message = buildMessage(USER_A, ROOM_ID, now);
      const pairs = await findProximityPairs(runtime, message);

      expect(pairs).toHaveLength(1);
      const entityIds = pairs.flatMap((p) => [p.entityA, p.entityB]);
      expect(entityIds).not.toContain(AGENT_ID);
    });

    test("skips messages older than the proximity window", async () => {
      const now = Date.now();
      const getMemoriesMock = vi.fn(async () => [
        buildMessage(USER_B, ROOM_ID, now - 10 * 60 * 1000), // 10 min ago, outside 5 min window
      ]);
      const runtime = {
        agentId: AGENT_ID,
        getMemories: getMemoriesMock,
      } as unknown as IAgentRuntime;

      const message = buildMessage(USER_A, ROOM_ID, now);
      const pairs = await findProximityPairs(runtime, message);

      expect(pairs).toHaveLength(0);
    });

    test("returns empty for agent sender", async () => {
      const runtime = {
        agentId: AGENT_ID,
        getMemories: vi.fn(async () => []),
      } as unknown as IAgentRuntime;

      const message = buildMessage(AGENT_ID, ROOM_ID);
      const pairs = await findProximityPairs(runtime, message);
      expect(pairs).toHaveLength(0);
    });
  });

  describe("updateProximityRelationships", () => {
    test("creates new relationship when none exists", async () => {
      const now = Date.now();
      const createRelationshipMock = vi.fn(async () => undefined);
      const runtime = {
        agentId: AGENT_ID,
        getMemories: vi.fn(async () => [
          buildMessage(USER_B, ROOM_ID, now - 30_000),
        ]),
        getRelationships: vi.fn(async () => []),
        createRelationship: createRelationshipMock,
        updateRelationship: vi.fn(),
      } as unknown as IAgentRuntime;

      const message = buildMessage(USER_A, ROOM_ID, now);
      const count = await updateProximityRelationships(runtime, message);

      expect(count).toBe(1);
      expect(createRelationshipMock).toHaveBeenCalledTimes(1);
      expect(createRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(["conversation", "shared_room"]),
          metadata: expect.objectContaining({
            autoDetected: true,
            interactionCount: 1,
          }),
        }),
      );
    });

    test("updates existing relationship strength", async () => {
      const now = Date.now();
      const updateRelationshipMock = vi.fn(async () => undefined);
      const runtime = {
        agentId: AGENT_ID,
        getMemories: vi.fn(async () => [
          buildMessage(USER_B, ROOM_ID, now - 30_000),
        ]),
        getRelationships: vi.fn(async () => [
          {
            id: uuid(999),
            sourceEntityId: USER_A,
            targetEntityId: USER_B,
            tags: ["relationships"],
            metadata: { strength: 0.5, interactionCount: 5 },
          },
        ]),
        createRelationship: vi.fn(),
        updateRelationship: updateRelationshipMock,
      } as unknown as IAgentRuntime;

      const message = buildMessage(USER_A, ROOM_ID, now);
      const count = await updateProximityRelationships(runtime, message);

      expect(count).toBe(1);
      expect(updateRelationshipMock).toHaveBeenCalledTimes(1);
      expect(updateRelationshipMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            interactionCount: 6,
          }),
        }),
      );
    });

    test("returns 0 for agent-sent messages", async () => {
      const runtime = {
        agentId: AGENT_ID,
        getMemories: vi.fn(async () => []),
      } as unknown as IAgentRuntime;

      const message = buildMessage(AGENT_ID, ROOM_ID);
      const count = await updateProximityRelationships(runtime, message);
      expect(count).toBe(0);
    });
  });
});
