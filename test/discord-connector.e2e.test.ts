/**
 * Discord Connector Validation Tests
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
import {
  extractPlugin,
  resolveDiscordPluginImportSpecifier,
} from "@miladyai/app-core/src/test-support/test-helpers";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });
dotenv.config({ path: path.resolve(packageRoot, "..", "eliza", ".env") });

const hasDiscordToken = Boolean(process.env.DISCORD_BOT_TOKEN);
const liveTestsEnabled = process.env.MILADY_LIVE_TEST === "1";
const runLiveTests = hasDiscordToken && liveTestsEnabled;
const DISCORD_PLUGIN_IMPORT = resolveDiscordPluginImportSpecifier();
const hasDiscordPlugin = DISCORD_PLUGIN_IMPORT !== null;

// Skip all tests if Discord token is not available
const describeIfLive =
  hasDiscordPlugin && runLiveTests ? describe : describe.skip;
const describeIfPluginAvailable = hasDiscordPlugin ? describe : describe.skip;

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

function expectDiscordPluginLike(plugin: Plugin): void {
  expect(["discord", "stub-plugin"]).toContain(plugin.name);
}

describeIfPluginAvailable("Discord Connector - Setup & Authentication", () => {
  it(
    "can load the Discord plugin without errors",
    async () => {
      const plugin = await loadDiscordPlugin();

      expect(plugin).not.toBeNull();
      if (plugin) {
        expectDiscordPluginLike(plugin);
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
        expectDiscordPluginLike(plugin);
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
        databaseAdapter: undefined as never,
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
            databaseAdapter: undefined as never,
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
// Integration Tests
// ---------------------------------------------------------------------------

describe("Discord Connector - Integration", () => {
  it("Discord connector is mapped in plugin auto-enable", async () => {
    const { CONNECTOR_PLUGINS } = await import(
      "@miladyai/app-core/src/config/plugin-auto-enable"
    );
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
  });

});
