/**
 * Nostr Connector Unit Tests — GitHub Issue #157
 *
 * Basic validation tests for the Nostr connector plugin.
 * For comprehensive e2e tests, see test/nostr-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveNostrPluginImportSpecifier,
} from "../test-support/test-helpers";

const NOSTR_PLUGIN_IMPORT = resolveNostrPluginImportSpecifier();
const NOSTR_PLUGIN_AVAILABLE = NOSTR_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = NOSTR_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadNostrPluginModule = async () => {
  if (!NOSTR_PLUGIN_IMPORT) {
    throw new Error("Nostr plugin is not resolvable");
  }
  return (await import(NOSTR_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Nostr Connector - Basic Validation", () => {
  it("can import the Nostr plugin package", async () => {
    const mod = await loadNostrPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("nostr");
  });

  it("plugin has a description", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as {
      clients?: unknown[];
      services?: unknown[];
    } | null;

    const hasClients =
      Array.isArray(plugin?.clients) && (plugin.clients?.length ?? 0) > 0;
    const hasServices =
      Array.isArray(plugin?.services) && (plugin.services?.length ?? 0) > 0;

    expect(hasClients || hasServices).toBe(true);
  });
});
