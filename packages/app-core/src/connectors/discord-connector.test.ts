/**
 * Discord Connector Unit Tests — GitHub Issue #143
 *
 * Basic validation tests for the Discord connector plugin.
 * For comprehensive e2e tests, see test/discord-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveDiscordPluginImportSpecifier,
} from "../test-support/test-helpers";

const DISCORD_PLUGIN_IMPORT = resolveDiscordPluginImportSpecifier();
const DISCORD_PLUGIN_AVAILABLE = DISCORD_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = DISCORD_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadDiscordPluginModule = async () => {
  if (!DISCORD_PLUGIN_IMPORT) {
    throw new Error("Discord plugin is not resolvable");
  }
  return (await import(DISCORD_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Discord Connector - Basic Validation", () => {
  it("can import the Discord plugin package", async () => {
    const mod = await loadDiscordPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    // In vitest, @elizaos/plugin-discord is aliased to a stub module (see
    // vitest.config.ts).  Accept either the real plugin name or the stub name.
    expect(["discord", "stub-plugin"]).toContain(plugin?.name);
  });

  it("plugin has a description", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });
});
