import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCheckSenderRole,
  mockResolveCanonicalOwnerIdForMessage,
  mockSendMessageToTarget,
  mockGetRoom,
  mockGetWorld,
} = vi.hoisted(() => ({
  mockCheckSenderRole: vi.fn(),
  mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  mockSendMessageToTarget: vi.fn(),
  mockGetRoom: vi.fn(),
  mockGetWorld: vi.fn(),
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
import { sendMessageAction } from "./send-message";

function makeRuntime(overrides?: Record<string, unknown>) {
  return {
    agentId: "agent-1" as UUID,
    character: { name: "TestAgent" },
    getRoom: mockGetRoom,
    getWorld: mockGetWorld,
    getService: () => null,
    sendMessageToTarget: mockSendMessageToTarget,
    getSetting: () => null,
    ...overrides,
  } as never;
}

function makeMessage(entityId: string, roomId = "room-1") {
  return {
    entityId,
    roomId,
    content: { source: "client_chat", text: "test" },
  } as never;
}

/** Helper — call handler with admin target params */
async function callAdminHandler(
  runtime: ReturnType<typeof makeRuntime>,
  message: ReturnType<typeof makeMessage>,
  params: Record<string, unknown>,
) {
  return sendMessageAction.handler?.(
    runtime,
    message,
    {} as never,
    { parameters: { target: "admin", ...params } } as never,
  );
}

describe("sendMessageAction — admin pathway (unified from SEND_ADMIN_MESSAGE)", () => {
  beforeEach(() => {
    mockCheckSenderRole.mockReset();
    mockSendMessageToTarget.mockReset();
    mockGetRoom.mockReset();
    mockGetWorld.mockReset();
    mockResolveCanonicalOwnerIdForMessage.mockReset();
    mockSendMessageToTarget.mockResolvedValue(undefined);
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // Permission checks (moved from validate to handler)
  // -----------------------------------------------------------------------

  it("allows the agent itself (autonomous)", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "hello" },
    );
    expect(result).toMatchObject({ success: true });
    // checkSenderRole should NOT be called for self
    expect(mockCheckSenderRole).not.toHaveBeenCalled();
  });

  it("allows admin callers", async () => {
    mockGetRoom.mockResolvedValue(null);
    mockCheckSenderRole.mockResolvedValue({
      entityId: "owner-1",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("owner-1"),
      { text: "hello" },
    );
    expect(result).toMatchObject({ success: true });
  });

  it("rejects non-admin callers", async () => {
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-1",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("user-1"),
      { text: "hello" },
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "PERMISSION_DENIED" },
    });
  });

  // -----------------------------------------------------------------------
  // handler — parameter validation
  // -----------------------------------------------------------------------

  it("rejects missing text", async () => {
    const result = await sendMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { target: "admin" } } as never,
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
    expect(mockSendMessageToTarget).not.toHaveBeenCalled();
  });

  it("rejects empty text", async () => {
    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "   " },
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
  });

  it("rejects invalid urgency", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "hello", urgency: "critical" },
    );
    expect(result).toMatchObject({
      success: false,
      values: { error: "INVALID_PARAMETERS" },
    });
  });

  // -----------------------------------------------------------------------
  // handler — successful sends
  // -----------------------------------------------------------------------

  it("sends to the configured canonical owner before consulting world ownership metadata", async () => {
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("owner-uuid-123");

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "Task completed" },
    );

    expect(result).toMatchObject({
      success: true,
      values: { success: true, urgency: "normal" },
      data: { actionName: "SEND_MESSAGE" },
    });
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("client_chat");
    expect(target.entityId).toBe("owner-uuid-123");
    expect(content.text).toBe("Task completed");
    expect(content.metadata).toEqual({ urgency: "normal" });
  });

  it("falls back to deterministic entity ID when no world ownership", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "Alert!", urgency: "urgent" },
    );

    expect(result).toMatchObject({
      success: true,
      values: { urgency: "urgent" },
    });
    expect(result).toMatchObject({
      text: "Message sent to admin (URGENT).",
    });
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
    const [target, content] = mockSendMessageToTarget.mock.calls[0];
    expect(target.source).toBe("client_chat");
    // Deterministic UUID from stringToUuid("TestAgent-admin-entity")
    expect(typeof target.entityId).toBe("string");
    expect(content.metadata).toEqual({ urgency: "urgent" });
  });

  it("handles send failure gracefully", async () => {
    mockGetRoom.mockResolvedValue(null);
    mockSendMessageToTarget.mockRejectedValue(new Error("WS not connected"));

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "urgent notification" },
    );

    expect(result).toMatchObject({
      success: false,
      values: { error: "SEND_FAILED" },
    });
  });

  it("trims whitespace from text", async () => {
    mockGetRoom.mockResolvedValue(null);

    await callAdminHandler(makeRuntime(), makeMessage("agent-1"), {
      text: "  hello world  ",
    });

    const [, content] = mockSendMessageToTarget.mock.calls[0];
    expect(content.text).toBe("hello world");
  });

  it("defaults urgency to normal when omitted", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await callAdminHandler(
      makeRuntime(),
      makeMessage("agent-1"),
      { text: "hi" },
    );

    expect(result).toMatchObject({ values: { urgency: "normal" } });
    const [, content] = mockSendMessageToTarget.mock.calls[0];
    expect(content.metadata).toEqual({ urgency: "normal" });
  });

  it("recognizes target 'owner' as admin pathway", async () => {
    mockGetRoom.mockResolvedValue(null);

    const result = await sendMessageAction.handler?.(
      makeRuntime(),
      makeMessage("agent-1"),
      {} as never,
      { parameters: { target: "owner", text: "hi owner" } } as never,
    );

    expect(result).toMatchObject({ success: true });
    expect(mockSendMessageToTarget).toHaveBeenCalledOnce();
  });
});
