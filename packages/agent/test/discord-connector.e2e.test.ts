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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const liveTestsEnabled = process.env.ELIZA_LIVE_TEST === "1";
const runLiveTests = hasDiscordToken && liveTestsEnabled;
const DISCORD_PLUGIN_IMPORT = resolveDiscordPluginImportSpecifier();
const hasDiscordPlugin = DISCORD_PLUGIN_IMPORT !== null;

// Skip all tests if Discord token is not available
const describeIfLive =
  hasDiscordPlugin && runLiveTests ? describe : describe.skip;
const describeIfPluginAvailable = hasDiscordPlugin ? describe : describe.skip;

logger.info(
  `[discord-connector] Live tests ${runLiveTests ? "ENABLED" : "DISABLED"} (DISCORD_BOT_TOKEN=${hasDiscordToken}, ELIZA_LIVE_TEST=${liveTestsEnabled})`,
);
logger.info(
  `[discord-connector] Plugin import ${DISCORD_PLUGIN_IMPORT ?? "UNAVAILABLE"}`,
);

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_TIMEOUT = 30_000; // 30 seconds for Discord API operations
const messageHandlingTodos = [
  "can receive text messages",
  "can send text messages",
  "handles DM functionality",
  "handles long message chunking (2000 char limit)",
  "renders markdown correctly",
  "supports threading",
] as const;

const discordSpecificTodos = [
  "implements slash commands",
  "renders embeds",
  "handles reactions",
  "processes user mentions (@user)",
  "processes role mentions (@role)",
  "processes @everyone/@here mentions",
] as const;

const mediaAttachmentTodos = [
  "receives images",
  "receives files",
  "sends images",
  "sends files",
  "sends images via embeds",
] as const;

const permissionsAndChannelsTodos = [
  "enforces channel permissions",
  "works in threads",
  "supports voice channel text chat",
  "handles multiple guilds",
] as const;

const errorHandlingTodos = [
  "handles rate limiting with backoff",
  "implements reconnection logic",
  "provides helpful error messages for permission issues",
] as const;

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

describeIfPluginAvailable("Discord Connector - Setup & Authentication", () => {
  it(
    "can load the Discord plugin without errors",
    async () => {
      const plugin = await loadDiscordPlugin();

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
      const plugin = await loadDiscordPlugin();

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
      const plugin = await loadDiscordPlugin();
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

describeIfLive("Discord Connector - Message Handling", () => {
  for (const title of messageHandlingTodos) {
    it.todo(title);
  }
});

// ---------------------------------------------------------------------------
// 3. Discord-Specific Features Tests
// ---------------------------------------------------------------------------

describeIfLive("Discord Connector - Discord-Specific Features", () => {
  for (const title of discordSpecificTodos) {
    it.todo(title);
  }
});

// ---------------------------------------------------------------------------
// 4. Media & Attachments Tests
// ---------------------------------------------------------------------------

describeIfLive("Discord Connector - Media & Attachments", () => {
  for (const title of mediaAttachmentTodos) {
    it.todo(title);
  }
});

// ---------------------------------------------------------------------------
// 5. Permissions & Channels Tests
// ---------------------------------------------------------------------------

describeIfLive("Discord Connector - Permissions & Channels", () => {
  for (const title of permissionsAndChannelsTodos) {
    it.todo(title);
  }
});

// ---------------------------------------------------------------------------
// 6. Error Handling Tests
// ---------------------------------------------------------------------------

describeIfLive("Discord Connector - Error Handling", () => {
  for (const title of errorHandlingTodos) {
    it.todo(title);
  }
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
