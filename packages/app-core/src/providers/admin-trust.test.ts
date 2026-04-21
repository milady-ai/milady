import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

const { mockCheckSenderRole, mockResolveCanonicalOwnerIdForMessage } =
  vi.hoisted(() => ({
    mockCheckSenderRole: vi.fn(),
    mockResolveCanonicalOwnerIdForMessage: vi.fn(),
  }));

vi.mock("@elizaos/core/roles", () => ({
  checkSenderRole: mockCheckSenderRole,
  resolveCanonicalOwnerIdForMessage: mockResolveCanonicalOwnerIdForMessage,
}));

import { adminTrustProvider } from "@miladyai/agent/providers/admin-trust";

function createRuntime(): IAgentRuntime {
  return {} as IAgentRuntime;
}

describe("admin-trust provider", () => {
  const provider = adminTrustProvider;
  const state = {
    recentMessagesData: [
      {
        content: {
          text: "admin trust provider status",
        },
      },
    ],
  } as State;

  it("marks canonical OWNER speaker as trusted admin", async () => {
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("admin-1");
    mockCheckSenderRole.mockResolvedValue({
      entityId: "shadow-admin",
      role: "OWNER",
      isOwner: true,
      isAdmin: true,
      canManageRoles: true,
    });

    const message = {
      roomId: "room-1",
      entityId: "shadow-admin",
      content: { text: "admin trust" },
    } as unknown as Memory;

    const result = await provider.get(createRuntime(), message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(true);
    expect(values.adminEntityId).toBe("admin-1");
    expect(values.adminRole).toBe("OWNER");
  });

  it("does not trust non-owner speakers", async () => {
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue("admin-1");
    mockCheckSenderRole.mockResolvedValue({
      entityId: "user-2",
      role: "USER",
      isOwner: false,
      isAdmin: false,
      canManageRoles: false,
    });

    const message = {
      roomId: "room-1",
      entityId: "user-2",
      content: { text: "admin trust" },
    } as unknown as Memory;

    const result = await provider.get(createRuntime(), message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(false);
  });

  it("returns false when no canonical owner can be resolved", async () => {
    mockResolveCanonicalOwnerIdForMessage.mockResolvedValue(null);
    mockCheckSenderRole.mockResolvedValue(null);

    const message = {
      roomId: "room-1",
      entityId: "admin-1",
      content: { text: "admin trust" },
    } as unknown as Memory;

    const result = await provider.get(createRuntime(), message, state);
    const values = result.values as Record<string, string | boolean>;
    expect(values.trustedAdmin).toBe(false);
    expect(values.adminEntityId).toBe("");
  });
});
