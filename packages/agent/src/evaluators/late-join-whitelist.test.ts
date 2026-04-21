import type { Memory, State, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetConnectorAdminWhitelist,
  mockMatchEntityToConnectorAdminWhitelist,
  mockResolveWorldForMessage,
  mockSetEntityRole,
} =
  vi.hoisted(() => ({
    mockGetConnectorAdminWhitelist: vi.fn(),
    mockMatchEntityToConnectorAdminWhitelist: vi.fn(),
    mockResolveWorldForMessage: vi.fn(),
    mockSetEntityRole: vi.fn(),
  }));

vi.mock("@elizaos/core/roles", () => ({
  getConnectorAdminWhitelist: mockGetConnectorAdminWhitelist,
  matchEntityToConnectorAdminWhitelist:
    mockMatchEntityToConnectorAdminWhitelist,
  resolveWorldForMessage: mockResolveWorldForMessage,
  setEntityRole: mockSetEntityRole,
}));

const { mockLoadElizaConfig } = vi.hoisted(() => ({
  mockLoadElizaConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadElizaConfig: mockLoadElizaConfig,
}));

import { lateJoinWhitelistEvaluator } from "./late-join-whitelist";

const ENTITY_ID = "entity-aaa" as UUID;
const ROOM_ID = "room-bbb" as UUID;
const WORLD_ID = "world-ccc" as UUID;

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent-ddd" as UUID,
    getEntityById: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as never;
}

function makeMessage(overrides: Record<string, unknown> = {}): Memory {
  return {
    entityId: ENTITY_ID,
    roomId: ROOM_ID,
    content: { text: "hello" },
    ...overrides,
  } as Memory;
}

const WORLD_METADATA = { roles: {} };

describe("lateJoinWhitelistEvaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConnectorAdminWhitelist.mockReturnValue({});
    mockMatchEntityToConnectorAdminWhitelist.mockReturnValue(null);
    mockResolveWorldForMessage.mockResolvedValue({
      world: { id: WORLD_ID, metadata: WORLD_METADATA },
      metadata: WORLD_METADATA,
    });
    mockLoadElizaConfig.mockReturnValue({});
  });

  it("has correct metadata", () => {
    expect(lateJoinWhitelistEvaluator.name).toBe("late_join_whitelist");
    expect(lateJoinWhitelistEvaluator.alwaysRun).toBe(true);
  });

  describe("validate", () => {
    it("returns true when entity has no stored role", async () => {
      mockResolveWorldForMessage.mockResolvedValue({
        world: { id: WORLD_ID, metadata: { roles: {} } },
        metadata: { roles: {} },
      });
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(true);
    });

    it("returns false when entity is already ADMIN", async () => {
      mockResolveWorldForMessage.mockResolvedValue({
        world: { id: WORLD_ID, metadata: { roles: { [ENTITY_ID]: "ADMIN" } } },
        metadata: { roles: { [ENTITY_ID]: "ADMIN" } },
      });
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });

    it("returns false when entity is already OWNER", async () => {
      mockResolveWorldForMessage.mockResolvedValue({
        world: { id: WORLD_ID, metadata: { roles: { [ENTITY_ID]: "OWNER" } } },
        metadata: { roles: { [ENTITY_ID]: "OWNER" } },
      });
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });

    it("returns false when world cannot be resolved", async () => {
      mockResolveWorldForMessage.mockResolvedValue(null);
      const result = await lateJoinWhitelistEvaluator.validate(
        makeRuntime(),
        makeMessage(),
      );
      expect(result).toBe(false);
    });
  });

  describe("handler", () => {
    it("promotes entity matching discord whitelist", async () => {
      mockLoadElizaConfig.mockReturnValue({
        roles: {
          connectorAdmins: {
            discord: ["discord-user-123"],
          },
        },
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue({
        connector: "discord",
        matchedValue: "discord-user-123",
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            discord: { userId: "discord-user-123" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ENTITY_ID }),
        ENTITY_ID,
        "ADMIN",
        "connector_admin",
      );
    });

    it("promotes entity matching telegram username", async () => {
      mockLoadElizaConfig.mockReturnValue({
        roles: {
          connectorAdmins: {
            telegram: ["tg_alice"],
          },
        },
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue({
        connector: "telegram",
        matchedValue: "tg_alice",
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            telegram: { username: "tg_alice" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ENTITY_ID }),
        ENTITY_ID,
        "ADMIN",
        "connector_admin",
      );
    });

    it("does nothing when entity does not match whitelist", async () => {
      mockLoadElizaConfig.mockReturnValue({
        roles: {
          connectorAdmins: {
            discord: ["discord-user-999"],
          },
        },
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            discord: { userId: "discord-user-123" },
          },
        }),
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue(null);

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("does nothing when no whitelist is configured", async () => {
      mockLoadElizaConfig.mockReturnValue({});

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: { discord: { userId: "discord-user-123" } },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("does nothing when entity is not found", async () => {
      mockLoadElizaConfig.mockReturnValue({
        roles: {
          connectorAdmins: { discord: ["anyone"] },
        },
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue({
        connector: "discord",
        matchedValue: "anyone",
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue(null),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("handles loadElizaConfig throwing gracefully", async () => {
      mockLoadElizaConfig.mockImplementation(() => {
        throw new Error("config not found");
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue({
        connector: "discord",
        matchedValue: "discord-user-123",
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: { discord: { userId: "discord-user-123" } },
        }),
      });

      // Should not throw
      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockSetEntityRole).not.toHaveBeenCalled();
    });

    it("prefers the runtime whitelist when plugin init already populated it", async () => {
      mockGetConnectorAdminWhitelist.mockReturnValue({
        discord: ["discord-user-123"],
      });
      mockMatchEntityToConnectorAdminWhitelist.mockReturnValue({
        connector: "discord",
        matchedValue: "discord-user-123",
      });

      const runtime = makeRuntime({
        getEntityById: vi.fn().mockResolvedValue({
          id: ENTITY_ID,
          metadata: {
            discord: { userId: "discord-user-123" },
          },
        }),
      });

      await lateJoinWhitelistEvaluator.handler(
        runtime,
        makeMessage(),
        {} as State,
      );

      expect(mockLoadElizaConfig).not.toHaveBeenCalled();
      expect(mockSetEntityRole).toHaveBeenCalledWith(
        runtime,
        expect.objectContaining({ entityId: ENTITY_ID }),
        ENTITY_ID,
        "ADMIN",
        "connector_admin",
      );
    });
  });
});
