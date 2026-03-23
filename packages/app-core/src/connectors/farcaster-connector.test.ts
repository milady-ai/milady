/**
 * Farcaster Connector Unit Tests — GitHub Issue #146
 *
 * Basic validation tests for the Farcaster connector plugin.
 * For comprehensive e2e tests, see test/farcaster-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFarcasterPluginImportSpecifier,
} from "../test-support/test-helpers";

const FARCASTER_PLUGIN_IMPORT = resolveFarcasterPluginImportSpecifier();
const FARCASTER_PLUGIN_AVAILABLE = FARCASTER_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = FARCASTER_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadFarcasterPluginModule = async () => {
  if (!FARCASTER_PLUGIN_IMPORT) {
    throw new Error("Farcaster plugin is not resolvable");
  }
  return (await import(FARCASTER_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Farcaster Connector - Basic Validation", () => {
  it("can import the Farcaster plugin package", async () => {
    const mod = await loadFarcasterPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("farcaster");
  });

  it("plugin has a description", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has services", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { services?: unknown[] } | null;

    expect(plugin?.services).toBeDefined();
    expect(Array.isArray(plugin?.services)).toBe(true);
  });

  it("plugin has actions", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { actions?: unknown[] } | null;

    expect(plugin?.actions).toBeDefined();
    expect(Array.isArray(plugin?.actions)).toBe(true);
    expect(plugin?.actions?.length).toBeGreaterThan(0);
  });
});
