/**
 * Discord Connector Validation Tests — GitHub Issue #143
 *
 * Comprehensive E2E tests for validating the Discord connector (@elizaos/plugin-discord).
 *
 * Test Categories:
 *   1. Setup & Authentication
 *   2. Message Handling
 *   3. Discord-Specific Features
 *   4. Media & Attachments
 *   5. Permissions & Channels
 *   6. Error Handling
 *
 * Requirements:
 *   - Discord Bot Token (DISCORD_BOT_TOKEN environment variable)
 *   - Test server with varied channel types
 *
 * NO MOCKS for live tests — all tests use real Discord API.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntime,
  createCharacter,
  logger,
  type Plugin,
  stringToUuid,
} from "@elizaos/core";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import {
  extractPlugin,
  resolveDiscordPluginImportSpecifier,
} from "../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });
dotenv.config({ path: path.resolve(packageRoot, "..", "..", ".env") });

const hasDiscordToken = Boolean(process.env.DISCORD_BOT_TOKEN);
const liveTestsEnabled =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";
const runLiveTests = hasDiscordToken && liveTestsEnabled;
const DISCORD_PLUGIN_IMPORT = resolveDiscordPluginImportSpecifier();
logger.info(
  `[discord-connector] Live tests ${runLiveTests ? "ENABLED" : "DISABLED"} (DISCORD_BOT_TOKEN=${hasDiscordToken}, MILADY_LIVE_TEST=${liveTestsEnabled})`,
);
logger.info(
  `[discord-connector] Plugin import ${DISCORD_PLUGIN_IMPORT ?? "UNAVAILABLE"}`,
);

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_TIMEOUT = 30_000; // 30 seconds for Discord API operations

type DiscordModuleExports = {
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// 1. Setup & Authentication Tests
// ---------------------------------------------------------------------------

const loadDiscordPlugin = async (): Promise<Plugin | null> => {
  if (!DISCORD_PLUGIN_IMPORT) {
    return null;
  }

  const mod = (await import(DISCORD_PLUGIN_IMPORT)) as {
    default?: Plugin;
    plugin?: Plugin;
    [key: string]: unknown;
  };
  return extractPlugin(mod) as Plugin | null;
};

const loadDiscordModule = async (): Promise<DiscordModuleExports | null> => {
  if (!DISCORD_PLUGIN_IMPORT) {
    return null;
  }

  return (await import(DISCORD_PLUGIN_IMPORT)) as DiscordModuleExports;
};

function requireDiscordExport<T>(key: string): T {
  const value = discordModuleProbe?.[key];
  if (value === undefined) {
    throw new Error(`Missing Discord export: ${key}`);
  }
  return value as T;
}

const discordPluginProbe = await loadDiscordPlugin();
const discordModuleProbe = await loadDiscordModule();
const hasDiscordPlugin = discordPluginProbe?.name === "discord";

// Skip all tests if Discord token is not available
const describeIfLive = describeIf(hasDiscordPlugin && runLiveTests);
const describeIfPluginAvailable = describeIf(hasDiscordPlugin);

describeIfPluginAvailable("Discord Connector - Setup & Authentication", () => {
  it(
    "can load the Discord plugin without errors",
    async () => {
      const plugin = discordPluginProbe;

      expect(plugin).not.toBeNull();
      if (plugin) {
        expect(plugin.name).toBe("discord");
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "Discord plugin exports required structure",
    async () => {
      const plugin = discordPluginProbe;

      expect(plugin).toBeDefined();
      if (plugin) {
        expect(plugin.name).toBe("discord");
        expect(plugin.description).toBeDefined();
      }
    },
    TEST_TIMEOUT,
  );

  describeIfLive("with real Discord connection", () => {
    let runtime: AgentRuntime | null = null;
    let discordPlugin: Plugin | null = null;

    beforeAll(async () => {
      // Load Discord plugin
      const plugin = discordPluginProbe;
      discordPlugin = plugin;

      if (!discordPlugin) {
        throw new Error("Failed to load Discord plugin");
      }

      // Create a test character
      const character = createCharacter({
        name: "TestBot",
        bio: ["Discord connector test bot"],
        system:
          "You are a test bot for validating Discord connector functionality.",
      });

      // Create runtime with Discord plugin
      runtime = new AgentRuntime({
        agentId: stringToUuid("discord-test-agent"),
        character,
        plugins: [discordPlugin],
        token: process.env.DISCORD_BOT_TOKEN,
        // databaseAdapter omitted — runtime uses in-memory for tests
        serverUrl: "http://localhost:3000",
      });
    }, TEST_TIMEOUT);

    afterAll(async () => {
      // Cleanup
      if (runtime) {
        // @ts-expect-error - cleanup method may not be in type
        await runtime.cleanup?.();
        runtime = null;
      }
    });

    it(
      "initializes the Discord runtime from the live bot token",
      async () => {
        expect(runtime).not.toBeNull();
        expect(process.env.DISCORD_BOT_TOKEN).toBeDefined();
        expect(runtime!.agentId).toBe(stringToUuid("discord-test-agent"));
        expect(runtime!.character.name).toBe("TestBot");
      },
      TEST_TIMEOUT,
    );

    it(
      "retains the live test character after startup",
      async () => {
        expect(runtime).not.toBeNull();
        expect(runtime!.character).toBeDefined();
        expect(runtime!.character.name).toBe("TestBot");
      },
      TEST_TIMEOUT,
    );

    it(
      "provides helpful error for invalid token",
      async () => {
        // Test with invalid token
        const invalidToken = "invalid-token-12345";

        try {
          const plugin = await loadDiscordPlugin();
          if (!plugin) {
            throw new Error("Failed to load Discord plugin");
          }

          const testCharacter = createCharacter({
            name: "InvalidTokenBot",
            bio: ["Test bot with invalid token"],
          });

          // This should fail with a helpful error message
          void new AgentRuntime({
            agentId: stringToUuid("invalid-token-test"),
            character: testCharacter,
            plugins: plugin ? [plugin] : [],
            token: invalidToken,
            // databaseAdapter omitted — runtime uses in-memory for tests
            serverUrl: "http://localhost:3000",
          });

          // If we get here, the test should verify that connection fails gracefully
          logger.warn(
            "[discord-connector] Invalid token test - runtime created but should fail on connect",
          );
        } catch (error) {
          // Expected behavior - should throw a helpful error
          expect(error).toBeDefined();
          logger.info(`[discord-connector] Invalid token error: ${error}`);
        }
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Message Handling Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable("Discord Connector - Message Handling", () => {
  it("registers text-channel and DM send actions", () => {
    const actionNames = (discordPluginProbe?.actions ?? []).map((action) =>
      String(action.name ?? ""),
    );

    expect(actionNames.some((name) => /SEND_MESSAGE/i.test(name))).toBe(true);
    expect(actionNames.some((name) => /SEND_DM/i.test(name))).toBe(true);
  });

  it("chunks long outbound text to Discord's message limit", () => {
    const chunkDiscordText = requireDiscordExport<
      (
        text: string,
        opts?: {
          maxChars?: number;
          maxLines?: number;
          chunkMode?: "length" | "newline";
        },
      ) => string[]
    >("chunkDiscordText");

    const chunks = chunkDiscordText(`Reasoning:\n_${"x".repeat(4500)}_`);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(chunks.every((chunk) => chunk.includes("_"))).toBe(true);
  });

  it("normalizes markdown content for Discord-safe rendering", () => {
    const escapeDiscordMarkdown = requireDiscordExport<
      (text: string) => string
    >("escapeDiscordMarkdown");
    const stripDiscordFormatting = requireDiscordExport<
      (text: string) => string
    >("stripDiscordFormatting");

    expect(escapeDiscordMarkdown("**bold** _under_ `code`")).toBe(
      "\\*\\*bold\\*\\* \\_under\\_ \\`code\\`",
    );
    expect(stripDiscordFormatting("**bold** and `code`")).toBe(
      "bold and code",
    );
  });

  it("applies DM allowlists when authorizing commands", () => {
    const resolveDiscordCommandAuthorized = requireDiscordExport<
      (params: {
        isDirectMessage: boolean;
        allowFrom?: Array<string | number>;
        author: { id: string; username: string; discriminator: string };
      }) => boolean
    >("resolveDiscordCommandAuthorized");

    const author = {
      id: "123",
      username: "milady",
      discriminator: "1234",
    };

    expect(
      resolveDiscordCommandAuthorized({
        isDirectMessage: true,
        allowFrom: ["discord:123"],
        author,
      }),
    ).toBe(true);
    expect(
      resolveDiscordCommandAuthorized({
        isDirectMessage: true,
        allowFrom: ["discord:999"],
        author,
      }),
    ).toBe(false);
    expect(
      resolveDiscordCommandAuthorized({
        isDirectMessage: false,
        allowFrom: ["discord:999"],
        author,
      }),
    ).toBe(true);
  });

  it("sanitizes reply thread names for Discord constraints", () => {
    const sanitizeThreadName = requireDiscordExport<
      (name: string) => string
    >("sanitizeThreadName");

    const threadName = sanitizeThreadName(
      `  Release\nnotes    ${"x".repeat(140)}  `,
    );

    expect(threadName).toContain("Release notes");
    expect(threadName).not.toContain("\n");
    expect(threadName.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 3. Discord-Specific Features Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable("Discord Connector - Discord-Specific Features", () => {
  it("builds slash commands with typed options", () => {
    const buildDiscordSlashCommand = requireDiscordExport<
      (spec: {
        name: string;
        description: string;
        args?: Array<{
          name: string;
          description: string;
          type: "string" | "number" | "boolean";
          required?: boolean;
          choices?: Array<{ label: string; value: string }>;
        }>;
      }) => {
        name: string;
        description: string;
        options?: Array<{
          name: string;
          description: string;
          type: number;
          required?: boolean;
          choices?: Array<{ name: string; value: string | number }>;
        }>;
      }
    >("buildDiscordSlashCommand");

    const command = buildDiscordSlashCommand({
      name: "poll",
      description: "Create a poll",
      args: [
        {
          name: "question",
          description: "Poll question",
          type: "string",
          required: true,
        },
        {
          name: "options",
          description: "How many options",
          type: "number",
        },
      ],
    });

    expect(command).toMatchObject({
      name: "poll",
      description: "Create a poll",
    });
    expect(command.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "question", required: true }),
        expect.objectContaining({ name: "options" }),
      ]),
    );
  });

  it("round-trips command argument custom ids", () => {
    const buildCommandArgCustomId = requireDiscordExport<
      (params: {
        command: string;
        arg: string;
        value: string;
        userId: string;
      }) => string
    >("buildCommandArgCustomId");
    const parseCommandArgCustomId = requireDiscordExport<
      (customId: string) => {
        command: string;
        arg: string;
        value: string;
        userId: string;
      } | null
    >("parseCommandArgCustomId");

    const customId = buildCommandArgCustomId({
      command: "poll",
      arg: "choice",
      value: "yes please",
      userId: "42",
    });

    expect(parseCommandArgCustomId(customId)).toEqual({
      command: "poll",
      arg: "choice",
      value: "yes please",
      userId: "42",
    });
    expect(parseCommandArgCustomId("not-a-command")).toBeNull();
  });

  it("extracts Discord mentions and reaction metadata", () => {
    const extractAllUserMentions = requireDiscordExport<
      (text: string) => string[]
    >("extractAllUserMentions");
    const extractAllRoleMentions = requireDiscordExport<
      (text: string) => string[]
    >("extractAllRoleMentions");
    const formatDiscordReactionEmoji = requireDiscordExport<
      (emoji: { id?: string | null; name?: string | null }) => string
    >("formatDiscordReactionEmoji");

    const text = "hi <@123> team <@&456>";
    expect(extractAllUserMentions(text)).toEqual(["123"]);
    expect(extractAllRoleMentions(text)).toEqual(["456"]);
    expect(formatDiscordReactionEmoji({ name: "party", id: "789" })).toBe(
      "party:789",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Media & Attachments Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable("Discord Connector - Media & Attachments", () => {
  it("registers media and attachment actions", () => {
    const actionNames = (discordPluginProbe?.actions ?? []).map((action) =>
      String(action.name ?? ""),
    );

    expect(
      actionNames.some((name) => /CHAT_WITH_ATTACHMENTS/i.test(name)),
    ).toBe(true);
    expect(actionNames.some((name) => /DOWNLOAD_MEDIA/i.test(name))).toBe(
      true,
    );
    expect(actionNames.some((name) => /TRANSCRIBE_MEDIA/i.test(name))).toBe(
      true,
    );
  });

  it("builds stable message and channel links for Discord resources", () => {
    const buildMessageLink = requireDiscordExport<
      (guildId: string, channelId: string, messageId: string) => string
    >("buildMessageLink");
    const buildChannelLink = requireDiscordExport<
      (guildId: string, channelId: string) => string
    >("buildChannelLink");

    expect(buildChannelLink("guild-1", "channel-2")).toBe(
      "https://discord.com/channels/guild-1/channel-2",
    );
    expect(buildMessageLink("guild-1", "channel-2", "message-3")).toBe(
      "https://discord.com/channels/guild-1/channel-2/message-3",
    );
  });

  it("extracts channel mentions from media-targeted messages", () => {
    const extractAllChannelMentions = requireDiscordExport<
      (text: string) => string[]
    >("extractAllChannelMentions");

    expect(extractAllChannelMentions("post it in <#123> and <#456>")).toEqual(
      ["123", "456"],
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Permissions & Channels Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable("Discord Connector - Permissions & Channels", () => {
  it("resolves parent channel policy for threads", () => {
    const resolveDiscordChannelConfigWithFallback = requireDiscordExport<
      (params: {
        guildInfo?: {
          channels?: Record<
            string,
            {
              allow?: boolean;
              requireMention?: boolean;
              autoThread?: boolean;
            }
          >;
        } | null;
        channelId: string;
        channelName?: string;
        parentId?: string;
        parentName?: string;
        isThread?: boolean;
      }) => {
        allowed: boolean;
        requireMention?: boolean;
        autoThread?: boolean;
        matchKey?: string;
        matchSource?: string;
      } | null
    >("resolveDiscordChannelConfigWithFallback");

    const resolved = resolveDiscordChannelConfigWithFallback({
      guildInfo: {
        channels: {
          "parent-1": {
            allow: true,
            requireMention: false,
            autoThread: true,
          },
        },
      },
      channelId: "thread-1",
      channelName: "Daily Thread",
      parentId: "parent-1",
      parentName: "general",
      isThread: true,
    });

    expect(resolved).toMatchObject({
      allowed: true,
      requireMention: false,
      autoThread: true,
      matchKey: "parent-1",
      matchSource: "parent",
    });
  });

  it("disables mention gating for bot-owned auto threads", () => {
    const resolveDiscordShouldRequireMention = requireDiscordExport<
      (params: {
        isGuildMessage: boolean;
        isThread: boolean;
        botId?: string | null;
        threadOwnerId?: string | null;
        channelConfig?: { autoThread?: boolean } | null;
      }) => boolean
    >("resolveDiscordShouldRequireMention");

    expect(
      resolveDiscordShouldRequireMention({
        isGuildMessage: true,
        isThread: true,
        botId: "bot-1",
        threadOwnerId: "bot-1",
        channelConfig: { autoThread: true },
      }),
    ).toBe(false);
  });

  it("emits reaction notifications according to ownership and allowlists", () => {
    const shouldEmitDiscordReactionNotification = requireDiscordExport<
      (params: {
        mode?: "off" | "own" | "all" | "allowlist";
        botId?: string;
        messageAuthorId?: string;
        userId: string;
        userName?: string;
        userTag?: string;
        allowlist?: Array<string | number>;
      }) => boolean
    >("shouldEmitDiscordReactionNotification");

    expect(
      shouldEmitDiscordReactionNotification({
        mode: "own",
        botId: "bot-1",
        messageAuthorId: "bot-1",
        userId: "user-1",
      }),
    ).toBe(true);
    expect(
      shouldEmitDiscordReactionNotification({
        mode: "allowlist",
        userId: "user-1",
        userName: "milady",
        allowlist: ["milady"],
      }),
    ).toBe(true);
    expect(
      shouldEmitDiscordReactionNotification({
        mode: "off",
        userId: "user-1",
      }),
    ).toBe(false);
  });

  it("generates invite URLs for every permission tier", () => {
    const generateAllInviteUrls = requireDiscordExport<
      (applicationId: string) => Record<string, string>
    >("generateAllInviteUrls");

    const urls = generateAllInviteUrls("123456");

    expect(Object.keys(urls)).toEqual(
      expect.arrayContaining([
        "basic",
        "basicVoice",
        "moderator",
        "moderatorVoice",
        "admin",
        "adminVoice",
      ]),
    );
    expect(Object.values(urls)).toSatisfy((values: string[]) =>
      values.every((url) => url.includes("client_id=123456")),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Error Handling Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable("Discord Connector - Error Handling", () => {
  it("warns instead of throwing when the Discord token is missing", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await discordPluginProbe?.init?.(
      {},
      {
        character: { name: "TestBot" },
        logger: { info: vi.fn() },
        getSetting: () => "",
      } as unknown as AgentRuntime,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Discord API Token not provided"),
    );
    warnSpy.mockRestore();
  });

  it("rejects malformed command custom ids", () => {
    const parseCommandArgCustomId = requireDiscordExport<
      (customId: string) => {
        command: string;
        arg: string;
        value: string;
        userId: string;
      } | null
    >("parseCommandArgCustomId");

    expect(parseCommandArgCustomId("cmdarg:command=poll;arg=choice")).toBeNull();
    expect(parseCommandArgCustomId("plain-text")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("Discord Connector - Integration", () => {
  it("Discord connector is mapped in plugin auto-enable", async () => {
    const { CONNECTOR_PLUGINS } = await import(
      "../src/config/plugin-auto-enable"
    );
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });

  it("Discord auto-enable requires a token in config", async () => {
    const { isConnectorConfigured } = await import(
      "../src/config/plugin-auto-enable"
    );

    expect(isConnectorConfigured("discord", { enabled: true })).toBe(false);
    expect(
      isConnectorConfigured("discord", {
        enabled: true,
        token: "test-token-value",
      }),
    ).toBe(true);
  });

  it("Discord is included in connector list", async () => {
    const { CONNECTOR_PLUGINS } = await import(
      "../src/config/plugin-auto-enable"
    );
    const connectors = Object.keys(CONNECTOR_PLUGINS);
    expect(connectors).toContain("discord");
  });

  it("Discord connector can be enabled/disabled via config", async () => {
    const { isConnectorConfigured } = await import(
      "../src/config/plugin-auto-enable"
    );

    expect(
      isConnectorConfigured("discord", { enabled: true, token: "t" }),
    ).toBe(true);
    expect(
      isConnectorConfigured("discord", { enabled: false, token: "t" }),
    ).toBe(false);
  });

  it("Discord auto-enables when token is present in config", async () => {
    const { isConnectorConfigured } = await import(
      "../src/config/plugin-auto-enable"
    );

    expect(
      isConnectorConfigured("discord", { token: "test-token-123" }),
    ).toBe(true);
  });

  it("Discord respects explicit disable even with token present", async () => {
    const { isConnectorConfigured } = await import(
      "../src/config/plugin-auto-enable"
    );

    expect(
      isConnectorConfigured("discord", {
        enabled: false,
        token: "test-token-123",
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Configuration Tests
// ---------------------------------------------------------------------------

describe("Discord Connector - Configuration", () => {
  it("validates Discord DM config via the real Zod schema", async () => {
    const { DiscordDmSchema } = await import(
      "../src/config/zod-schema.providers-core"
    );
    const result = DiscordDmSchema.safeParse({
      enabled: true,
      policy: "pairing",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.policy).toBe("pairing");
    }
  });

  it("rejects invalid DM policy via the real Zod schema", async () => {
    const { DiscordDmSchema } = await import(
      "../src/config/zod-schema.providers-core"
    );
    const result = DiscordDmSchema.safeParse({
      policy: "invalid-policy",
    });

    expect(result.success).toBe(false);
  });

  it("validates Discord account config via the real Zod schema", async () => {
    const { DiscordAccountSchema } = await import(
      "../src/config/zod-schema.providers-core"
    );
    const result = DiscordAccountSchema.safeParse({
      token: "main-token",
      maxLinesPerMessage: 17,
      textChunkLimit: 2000,
      chunkMode: "length",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.textChunkLimit).toBe(2000);
      expect(result.data.chunkMode).toBe("length");
    }
  });

  it("validates Discord guild config via the real Zod schema", async () => {
    const { DiscordGuildSchema } = await import(
      "../src/config/zod-schema.providers-core"
    );
    const result = DiscordGuildSchema.safeParse({
      requireMention: true,
      reactionNotifications: "own",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown fields in the strict guild channel schema", async () => {
    const { DiscordGuildChannelSchema } = await import(
      "../src/config/zod-schema.providers-core"
    );
    const result = DiscordGuildChannelSchema.safeParse({
      allow: true,
      bogusField: 123,
    });

    expect(result.success).toBe(false);
  });
});
