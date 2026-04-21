/**
 * Discord Config Serialization Round-Trip Tests
 *
 * Verifies that Discord channel configuration survives JSON serialization
 * and deserialization without data loss. This is critical because agent
 * configs are stored as JSON (milady.json) and must round-trip cleanly.
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Type definitions matching @elizaos/plugin-discord config shapes
// ---------------------------------------------------------------------------

/** Per-channel configuration (matches DiscordChannelConfig from the plugin). */
interface DiscordChannelConfig {
  channelId: string;
  enabled?: boolean;
  responseMode?: "always" | "mention" | "off";
  allowedActions?: string[];
  blockedActions?: string[];
}

/** Per-guild configuration. */
interface DiscordGuildConfig {
  guildId: string;
  enabled?: boolean;
  nickname?: string;
  channels?: Record<string, DiscordChannelConfig>;
  defaultResponseMode?: "always" | "mention" | "off";
}

/** DM policy configuration. */
interface DiscordDmPolicy {
  enabled?: boolean;
  allowList?: string[];
  blockList?: string[];
  responseMode?: "always" | "off";
}

/** Action gating configuration. */
interface DiscordActionGating {
  globalAllowedActions?: string[];
  globalBlockedActions?: string[];
  perGuild?: Record<string, { allowed?: string[]; blocked?: string[] }>;
}

/** Multi-account configuration. */
interface DiscordMultiAccountConfig {
  accounts: Array<{
    id: string;
    token: string;
    applicationId?: string;
    guilds?: Record<string, DiscordGuildConfig>;
    dmPolicy?: DiscordDmPolicy;
  }>;
}

/** Full discord connector config as stored in milady.json. */
interface FullDiscordConfig {
  token?: string;
  botToken?: string;
  applicationId?: string;
  enabled?: boolean;
  guilds?: Record<string, DiscordGuildConfig>;
  dmPolicy?: DiscordDmPolicy;
  actionGating?: DiscordActionGating;
  multiAccount?: DiscordMultiAccountConfig;
}

// ---------------------------------------------------------------------------
// Helper: round-trip a value through JSON serialization
// ---------------------------------------------------------------------------

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("discord config serialization round-trip", () => {
  it("minimal config with just a token survives round-trip", () => {
    const config: FullDiscordConfig = {
      token: "test-token-abc",
    };
    expect(roundTrip(config)).toEqual(config);
  });

  it("full top-level fields survive round-trip", () => {
    const config: FullDiscordConfig = {
      token: "test-token",
      botToken: "bot-token",
      applicationId: "app-123",
      enabled: true,
    };
    expect(roundTrip(config)).toEqual(config);
  });

  it("per-guild config survives serialization", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      guilds: {
        "guild-001": {
          guildId: "guild-001",
          enabled: true,
          nickname: "Milady",
          defaultResponseMode: "mention",
        },
        "guild-002": {
          guildId: "guild-002",
          enabled: false,
        },
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);
    expect(result.guilds?.["guild-001"]?.nickname).toBe("Milady");
    expect(result.guilds?.["guild-002"]?.enabled).toBe(false);
  });

  it("per-channel config within guilds survives serialization", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      guilds: {
        "guild-001": {
          guildId: "guild-001",
          channels: {
            "chan-a": {
              channelId: "chan-a",
              enabled: true,
              responseMode: "always",
              allowedActions: ["SEND_MESSAGE", "REACT"],
              blockedActions: [],
            },
            "chan-b": {
              channelId: "chan-b",
              enabled: false,
              responseMode: "off",
            },
          },
        },
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);

    const chanA = result.guilds?.["guild-001"]?.channels?.["chan-a"];
    expect(chanA?.allowedActions).toEqual(["SEND_MESSAGE", "REACT"]);
    expect(chanA?.responseMode).toBe("always");
  });

  it("DM policy config survives serialization", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      dmPolicy: {
        enabled: true,
        allowList: ["user-1", "user-2"],
        blockList: ["user-3"],
        responseMode: "always",
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);
    expect(result.dmPolicy?.allowList).toHaveLength(2);
    expect(result.dmPolicy?.blockList).toEqual(["user-3"]);
  });

  it("action gating config survives serialization", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      actionGating: {
        globalAllowedActions: ["SEND_MESSAGE", "REACT", "VOICE_JOIN"],
        globalBlockedActions: ["DELETE_MESSAGE"],
        perGuild: {
          "guild-001": {
            allowed: ["SEND_MESSAGE"],
            blocked: ["VOICE_JOIN"],
          },
          "guild-002": {
            allowed: [],
            blocked: ["REACT"],
          },
        },
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);
    expect(result.actionGating?.globalAllowedActions).toHaveLength(3);
    expect(result.actionGating?.perGuild?.["guild-001"]?.blocked).toEqual([
      "VOICE_JOIN",
    ]);
  });

  it("multi-account config survives serialization", () => {
    const config: FullDiscordConfig = {
      multiAccount: {
        accounts: [
          {
            id: "account-1",
            token: "token-1",
            applicationId: "app-1",
            guilds: {
              "guild-a": {
                guildId: "guild-a",
                enabled: true,
                nickname: "Bot Alpha",
              },
            },
            dmPolicy: {
              enabled: true,
              allowList: ["vip-user"],
            },
          },
          {
            id: "account-2",
            token: "token-2",
          },
        ],
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);
    expect(result.multiAccount?.accounts).toHaveLength(2);
    expect(result.multiAccount?.accounts[0].guilds?.["guild-a"]?.nickname).toBe(
      "Bot Alpha",
    );
  });

  it("empty arrays and objects survive round-trip", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      guilds: {},
      dmPolicy: {
        enabled: false,
        allowList: [],
        blockList: [],
      },
      actionGating: {
        globalAllowedActions: [],
        globalBlockedActions: [],
        perGuild: {},
      },
    };
    const result = roundTrip(config);
    expect(result).toEqual(config);
  });

  it("nested config is a deep copy, not a reference", () => {
    const config: FullDiscordConfig = {
      token: "tok",
      guilds: {
        "guild-001": {
          guildId: "guild-001",
          channels: {
            "chan-a": {
              channelId: "chan-a",
              allowedActions: ["SEND_MESSAGE"],
            },
          },
        },
      },
    };
    const result = roundTrip(config);

    // Mutating the result should not affect the original
    result.guilds!["guild-001"].channels!["chan-a"].allowedActions!.push("REACT");
    expect(
      config.guilds!["guild-001"].channels!["chan-a"].allowedActions,
    ).toHaveLength(1);
  });

  it("config with all fields populated survives round-trip", () => {
    // Comprehensive config exercising every field
    const config: FullDiscordConfig = {
      token: "comprehensive-token",
      botToken: "comprehensive-bot-token",
      applicationId: "comprehensive-app-id",
      enabled: true,
      guilds: {
        "guild-full": {
          guildId: "guild-full",
          enabled: true,
          nickname: "Full Bot",
          defaultResponseMode: "always",
          channels: {
            "chan-1": {
              channelId: "chan-1",
              enabled: true,
              responseMode: "mention",
              allowedActions: ["A", "B"],
              blockedActions: ["C"],
            },
          },
        },
      },
      dmPolicy: {
        enabled: true,
        allowList: ["u1"],
        blockList: ["u2"],
        responseMode: "always",
      },
      actionGating: {
        globalAllowedActions: ["X"],
        globalBlockedActions: ["Y"],
        perGuild: {
          "guild-full": { allowed: ["X"], blocked: [] },
        },
      },
      multiAccount: {
        accounts: [
          {
            id: "acct-1",
            token: "t1",
            applicationId: "a1",
            guilds: {
              "g1": { guildId: "g1", enabled: true },
            },
            dmPolicy: { enabled: false },
          },
        ],
      },
    };
    expect(roundTrip(config)).toEqual(config);
  });
});
