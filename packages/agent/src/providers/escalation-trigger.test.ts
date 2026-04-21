import type { Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock calls can reference them
// ---------------------------------------------------------------------------

const { mockGetActiveEscalationSync } = vi.hoisted(() => ({
  mockGetActiveEscalationSync: vi.fn(),
}));

const { mockResolveCanonicalOwnerIdForMessage } = vi.hoisted(() => ({
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
}));

const { mockHasAdminAccess } = vi.hoisted(() => ({
  mockHasAdminAccess: vi.fn(),
}));

vi.mock("../services/escalation.js", () => ({
  EscalationService: {
    getActiveEscalationSync: mockGetActiveEscalationSync,
  },
}));

vi.mock("@elizaos/core/roles", () => ({
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

vi.mock("../security/access.js", () => ({
  hasAdminAccess: mockHasAdminAccess,
}));

import { createEscalationTriggerProvider } from "./escalation-trigger";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT_ID = "agent-aaa" as UUID;
const OWNER_ID = "owner-bbb" as UUID;
const ROOM_ID = "room-ccc" as UUID;
const WORLD_ID = "world-ddd" as UUID;
const USER_ID = "user-eee" as UUID;

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: AGENT_ID,
    getRoom: vi.fn().mockResolvedValue({
      id: ROOM_ID,
      worldId: WORLD_ID,
      source: "discord",
    }),
    getWorld: vi.fn().mockResolvedValue({
      id: WORLD_ID,
      metadata: { ownership: { ownerId: OWNER_ID } },
    }),
    getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    getRelationships: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: USER_ID,
    roomId: ROOM_ID,
    content: { text: "hello", source: "discord" },
    ...overrides,
  } as Memory;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("escalationTriggerProvider", () => {
  const provider = createEscalationTriggerProvider();

  beforeEach(() => {
    mockGetActiveEscalationSync.mockReset();
    mockGetActiveEscalationSync.mockReturnValue(null);
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(OWNER_ID);
    mockHasAdminAccess.mockReset();
    mockHasAdminAccess.mockResolvedValue(true);
  });

  it("has correct metadata", () => {
    expect(provider.name).toBe("escalationTrigger");
    expect(provider.dynamic).toBe(true);
    expect(provider.position).toBe(15);
  });

  it("returns empty when no triggers are detected", async () => {
    const result = await provider.get(
      makeRuntime(),
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
    expect(result.values).toEqual({ hasEscalationTriggers: false });
  });

  it("returns empty for non-admin callers", async () => {
    mockHasAdminAccess.mockResolvedValue(false);

    const result = await provider.get(
      makeRuntime(),
      makeMessage(),
      {} as never,
    );

    expect(result.text).toBe("");
    expect(result.values).toEqual({ hasEscalationTriggers: false });
  });

  it("detects an active escalation", async () => {
    mockGetActiveEscalationSync.mockReturnValue({
      id: "esc-1",
      reason: "User reported emergency",
      currentStep: 1,
      channelsSent: ["client_chat", "telegram"],
      resolved: false,
    });

    const result = await provider.get(
      makeRuntime(),
      makeMessage(),
      {} as never,
    );

    expect(result.values).toMatchObject({
      hasEscalationTriggers: true,
      highestUrgency: "high",
    });
    expect(result.text).toContain("Active escalation in progress (step 2)");
    expect(result.text).toContain("client_chat, telegram");
  });

  it("skips resolved escalations", async () => {
    mockGetActiveEscalationSync.mockReturnValue({
      id: "esc-2",
      reason: "old",
      currentStep: 0,
      channelsSent: [],
      resolved: true,
    });

    const result = await provider.get(
      makeRuntime(),
      makeMessage(),
      {} as never,
    );

    expect(result.values).toEqual({ hasEscalationTriggers: false });
  });

  it("detects owner inactive for 24+ hours (agent-self message)", async () => {
    const thirtyHoursAgo = Date.now() - 30 * 60 * 60 * 1000;
    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue(["room-x" as UUID]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        {
          entityId: OWNER_ID,
          createdAt: thirtyHoursAgo,
          content: { text: "old message" },
        },
      ]),
    });

    // Agent talking to itself = autonomous loop
    const result = await provider.get(
      runtime,
      makeMessage({ entityId: AGENT_ID }),
      {} as never,
    );

    expect(result.values).toMatchObject({
      hasEscalationTriggers: true,
      highestUrgency: "low",
    });
    expect(result.text).toContain("Owner last seen 30 hours ago");
  });

  it("skips owner-inactivity check for non-agent callers", async () => {
    const thirtyHoursAgo = Date.now() - 30 * 60 * 60 * 1000;
    const runtime = makeRuntime({
      getRoomsForParticipant: vi.fn().mockResolvedValue(["room-x" as UUID]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        {
          entityId: OWNER_ID,
          createdAt: thirtyHoursAgo,
          content: { text: "old message" },
        },
      ]),
    });

    // Regular user message — NOT autonomous
    const result = await provider.get(
      runtime,
      makeMessage({ entityId: USER_ID }),
      {} as never,
    );

    // Owner inactivity should not appear
    expect(result.text).not.toContain("Owner last seen");
  });

  it("detects pending identity verifications", async () => {
    const runtime = makeRuntime({
      getRelationships: vi.fn().mockResolvedValue([
        {
          id: "rel-1",
          entityId: USER_ID,
          targetEntityId: "other-entity",
          tags: ["identity_link"],
          metadata: { status: "proposed" },
        },
        {
          id: "rel-2",
          entityId: USER_ID,
          targetEntityId: "another-entity",
          tags: ["identity_link"],
          metadata: { status: "confirmed" },
        },
      ]),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.values).toMatchObject({
      hasEscalationTriggers: true,
      highestUrgency: "medium",
    });
    expect(result.text).toContain("1 identity verification(s) pending");
  });

  it("shows multiple triggers with highest urgency in values", async () => {
    mockGetActiveEscalationSync.mockReturnValue({
      id: "esc-3",
      reason: "Emergency",
      currentStep: 0,
      channelsSent: ["client_chat"],
      resolved: false,
    });

    const runtime = makeRuntime({
      getRelationships: vi.fn().mockResolvedValue([
        {
          id: "rel-1",
          entityId: USER_ID,
          tags: ["identity_link"],
          metadata: { status: "proposed" },
        },
      ]),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    expect(result.values).toMatchObject({
      hasEscalationTriggers: true,
      triggerCount: 2,
      highestUrgency: "high",
    });
    // Both triggers present
    expect(result.text).toContain("[HIGH]");
    expect(result.text).toContain("[MEDIUM]");
    expect(result.text).toContain("SEND_ADMIN_MESSAGE");
  });

  it("silently skips when getRelationships throws", async () => {
    const runtime = makeRuntime({
      getRelationships: vi.fn().mockRejectedValue(new Error("not available")),
    });

    const result = await provider.get(runtime, makeMessage(), {} as never);

    // Should not throw, just return empty
    expect(result.values).toEqual({ hasEscalationTriggers: false });
  });
});
