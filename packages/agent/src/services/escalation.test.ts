import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetMissingSendHandlerLogsForTests } from "./send-handler-availability.js";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockSendMessageToTarget = vi.hoisted(() => vi.fn());
const mockGetRoomsForParticipant = vi.hoisted(() => vi.fn());
const mockGetMemoriesByRoomIds = vi.hoisted(() => vi.fn());
const mockLoadElizaConfig = vi.hoisted(() => vi.fn());
const mockResolveOwnerEntityId = vi.hoisted(() => vi.fn());

vi.mock("@elizaos/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/core")>();
  return {
    ...actual,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("../config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

vi.mock("../runtime/owner-entity.js", () => ({
  resolveOwnerEntityId: mockResolveOwnerEntityId,
}));

import type { UUID } from "@elizaos/core";
import { EscalationService } from "./escalation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    sendHandlers: new Map<string, unknown>([["client_chat", vi.fn()]]),
    sendMessageToTarget: mockSendMessageToTarget,
    getRoomsForParticipant: mockGetRoomsForParticipant,
    getMemoriesByRoomIds: mockGetMemoriesByRoomIds,
    ...overrides,
  } as never;
}

function setConfig(
  escalation?: Record<string, unknown>,
  ownerContacts?: Record<string, unknown>,
) {
  mockLoadElizaConfig.mockReturnValue({
    agents: {
      defaults: {
        escalation: escalation ?? {},
        ownerContacts: ownerContacts ?? {
          client_chat: { entityId: "owner-1" },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EscalationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMissingSendHandlerLogsForTests();
    EscalationService._reset();
    mockSendMessageToTarget.mockResolvedValue(undefined);
    mockGetRoomsForParticipant.mockResolvedValue([]);
    mockGetMemoriesByRoomIds.mockResolvedValue([]);
    mockResolveOwnerEntityId.mockResolvedValue(null);
    setConfig();
  });

  // -----------------------------------------------------------------------
  // startEscalation
  // -----------------------------------------------------------------------

  it("sends to the first configured channel immediately", async () => {
    setConfig(
      { channels: ["client_chat", "telegram"], waitMinutes: 5, maxRetries: 3 },
      {
        client_chat: { entityId: "owner-1" },
        telegram: { entityId: "owner-1", channelId: "tg-123" },
      },
    );

    const state = await EscalationService.startEscalation(
      makeRuntime(),
      "test reason",
      "Something needs attention",
    );

    expect(state.id).toMatch(/^esc-/);
    expect(state.resolved).toBe(false);
    expect(state.channelsSent).toEqual(["client_chat"]);
    expect(state.currentStep).toBe(0);

    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("client_chat");
    expect(target.entityId).toBe("owner-1");
    expect(content.text).toBe("Something needs attention");
    expect(content.metadata).toEqual(
      expect.objectContaining({
        urgency: "urgent",
        escalation: true,
        routeSource: "client_chat",
        routeResolution: "config",
      }),
    );
  });

  it("routes telegram reminders through the telegramAccount owner contact when that is the configured endpoint", async () => {
    setConfig(
      { channels: ["telegram"], waitMinutes: 5, maxRetries: 3 },
      {
        telegramAccount: {
          entityId: "owner-1",
          channelId: "tg-account-123",
        },
      },
    );

    const state = await EscalationService.startEscalation(
      makeRuntime(),
      "test reason",
      "Telegram account reminder",
    );

    expect(state.channelsSent).toEqual(["telegram"]);
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("telegram-account");
    expect(target.channelId).toBe("tg-account-123");
    expect(content.source).toBe("telegram-account");
    expect(content.metadata).toEqual(
      expect.objectContaining({
        routeSource: "telegram-account",
      }),
    );
  });

  it("falls back to the resolved owner entity for discord escalation", async () => {
    mockResolveOwnerEntityId.mockResolvedValue("owner-discord-uuid");
    setConfig({ channels: ["discord"], waitMinutes: 5, maxRetries: 1 }, {});

    const state = await EscalationService.startEscalation(
      makeRuntime(),
      "discord fallback",
      "Check Discord DM routing",
    );

    expect(state.channelsSent).toEqual(["discord"]);
    expect(mockSendMessageToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-discord-uuid",
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          routeSource: "discord",
          routeResolution: "config",
          routeEndpoint: "owner-discord-uuid",
        }),
      }),
    );
  });

  it("skips client_chat escalation delivery until the send handler is registered", async () => {
    const state = await EscalationService.startEscalation(
      makeRuntime({ sendHandlers: new Map<string, unknown>() }),
      "test reason",
      "Something needs attention",
    );

    expect(state.channelsSent).toEqual([]);
    expect(mockSendMessageToTarget).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // checkEscalation — advance to next channel
  // -----------------------------------------------------------------------

  it("advances to the next channel when owner has not responded", async () => {
    setConfig(
      { channels: ["client_chat", "telegram"], waitMinutes: 1, maxRetries: 3 },
      {
        client_chat: { entityId: "owner-1" },
        telegram: { entityId: "owner-1", channelId: "tg-123" },
      },
    );

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "urgent",
      "Help needed",
    );

    // No owner response — getMemoriesByRoomIds returns empty.
    mockSendMessageToTarget.mockClear();

    await EscalationService.checkEscalation(runtime, state.id);

    expect(state.currentStep).toBe(1);
    expect(state.channelsSent).toContain("telegram");
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("telegram");
  });

  // -----------------------------------------------------------------------
  // checkEscalation — resolves on owner response
  // -----------------------------------------------------------------------

  it("resolves when the owner has responded", async () => {
    setConfig(
      { channels: ["client_chat", "telegram"], waitMinutes: 1, maxRetries: 3 },
      {
        client_chat: { entityId: "owner-1" },
        telegram: { entityId: "owner-1", channelId: "tg-123" },
      },
    );

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "urgent",
      "Help needed",
    );

    // Simulate owner response: getRoomsForParticipant returns a room,
    // getMemoriesByRoomIds returns a message from the owner after lastSentAt.
    mockGetRoomsForParticipant.mockResolvedValue(["room-abc" as UUID]);
    mockGetMemoriesByRoomIds.mockResolvedValue([
      {
        entityId: "owner-1",
        createdAt: Date.now() + 1000,
        content: { text: "Got it" },
      },
    ]);

    mockSendMessageToTarget.mockClear();
    await EscalationService.checkEscalation(runtime, state.id);

    expect(state.resolved).toBe(true);
    expect(state.resolvedAt).toBeTypeOf("number");
    // Should NOT have sent to next channel.
    expect(mockSendMessageToTarget).not.toHaveBeenCalled();
  });

  it("uses relationships hints to resolve the selected escalation endpoint", async () => {
    setConfig(
      { channels: ["discord"], waitMinutes: 1, maxRetries: 3 },
      { discord: { entityId: "owner-1" } },
    );

    const runtime = makeRuntime({
      getService: vi.fn((name: string) =>
        name === "relationships"
          ? {
              getContact: vi.fn().mockResolvedValue({
                preferences: { preferredCommunicationChannel: "discord" },
                customFields: {
                  discordChannelId: "dm-relationships",
                },
              }),
            }
          : null,
      ),
      getRoomsForParticipant: vi.fn().mockResolvedValue(["room-1"]),
      getMemoriesByRoomIds: vi.fn().mockResolvedValue([
        {
          entityId: "owner-1",
          createdAt: Date.now() + 1000,
          content: { text: "responded" },
        },
      ]),
    });

    const state = await EscalationService.startEscalation(
      runtime,
      "test",
      "hello",
    );

    expect(state.channelsSent).toEqual(["discord"]);
    expect(mockSendMessageToTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "discord",
        entityId: "owner-1",
        channelId: "dm-relationships",
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          routeSource: "discord",
          routeResolution: "config+relationships",
          routeEndpoint: "dm-relationships",
          routeLastResponseChannel: "discord",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Max retries
  // -----------------------------------------------------------------------

  it("stops after max retries are exhausted", async () => {
    setConfig(
      { channels: ["client_chat"], waitMinutes: 1, maxRetries: 2 },
      { client_chat: { entityId: "owner-1" } },
    );

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "urgent",
      "Help",
    );

    // Step 0 already happened (initial send). Check advances to step 1.
    await EscalationService.checkEscalation(runtime, state.id);
    expect(state.currentStep).toBe(1);
    expect(state.channelsSent).toEqual(["client_chat", "client_chat"]);

    // Step 1 -> step 2: exceeds maxRetries (2), so it gives up.
    await EscalationService.checkEscalation(runtime, state.id);
    expect(state.currentStep).toBe(2);
    expect(state.resolved).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Cooldown — coalesce into existing
  // -----------------------------------------------------------------------

  it("coalesces a new escalation into an existing active one", async () => {
    setConfig(
      { channels: ["client_chat"], waitMinutes: 5, maxRetries: 3 },
      { client_chat: { entityId: "owner-1" } },
    );

    const runtime = makeRuntime();
    const first = await EscalationService.startEscalation(
      runtime,
      "reason-1",
      "Text one",
    );
    const second = await EscalationService.startEscalation(
      runtime,
      "reason-2",
      "Text two",
    );

    // Same escalation object, with merged content.
    expect(second.id).toBe(first.id);
    expect(second.reason).toContain("reason-1");
    expect(second.reason).toContain("reason-2");
    expect(second.text).toContain("Text one");
    expect(second.text).toContain("Text two");

    // Only one sendMessageToTarget call (the initial send for the first).
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Missing config — uses defaults
  // -----------------------------------------------------------------------

  it("uses default config when escalation config is missing", async () => {
    // Return empty config — no escalation or ownerContacts sections.
    mockLoadElizaConfig.mockReturnValue({});

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "fallback",
      "Default test",
    );

    // Default channel is client_chat, but no owner contact configured
    // so send should fail gracefully.
    expect(state.channelsSent).toEqual([]);
    expect(state.resolved).toBe(false);
  });

  it("uses defaults when loadElizaConfig throws", async () => {
    mockLoadElizaConfig.mockImplementation(() => {
      throw new Error("file not found");
    });

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "error-case",
      "Config broken",
    );

    expect(state.channelsSent).toEqual([]);
    expect(state.resolved).toBe(false);
  });

  // -----------------------------------------------------------------------
  // getActiveEscalation
  // -----------------------------------------------------------------------

  it("returns null when no active escalation exists", async () => {
    const result = await EscalationService.getActiveEscalation(makeRuntime());
    expect(result).toBeNull();
  });

  it("returns the active escalation", async () => {
    setConfig(
      { channels: ["client_chat"], waitMinutes: 5, maxRetries: 1 },
      { client_chat: { entityId: "owner-1" } },
    );

    const runtime = makeRuntime();
    await EscalationService.startEscalation(runtime, "test", "hello");

    const active = await EscalationService.getActiveEscalation(runtime);
    expect(active).not.toBeNull();
    expect(active?.reason).toBe("test");
  });

  // -----------------------------------------------------------------------
  // resolveEscalation
  // -----------------------------------------------------------------------

  it("resolveEscalation marks escalation resolved", async () => {
    setConfig(
      { channels: ["client_chat"], waitMinutes: 5, maxRetries: 3 },
      { client_chat: { entityId: "owner-1" } },
    );

    const runtime = makeRuntime();
    const state = await EscalationService.startEscalation(
      runtime,
      "test",
      "hello",
    );

    EscalationService.resolveEscalation(state.id);

    expect(state.resolved).toBe(true);
    expect(state.resolvedAt).toBeTypeOf("number");

    // No active escalation anymore.
    const active = await EscalationService.getActiveEscalation(runtime);
    expect(active).toBeNull();
  });

  it("resolveEscalation is idempotent", () => {
    // Resolving a non-existent escalation should not throw.
    expect(() =>
      EscalationService.resolveEscalation("nonexistent"),
    ).not.toThrow();
  });
});
