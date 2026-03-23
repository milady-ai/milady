/**
 * Lens Protocol Connector Unit Tests — GitHub Issue #151
 *
 * Basic validation tests for the Lens Protocol connector plugin.
 * For comprehensive e2e tests, see test/lens-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveLensPluginImportSpecifier,
} from "../test-support/test-helpers";

const LENS_PLUGIN_IMPORT = resolveLensPluginImportSpecifier();
const LENS_PLUGIN_AVAILABLE = LENS_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = LENS_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadLensPluginModule = async () => {
  if (!LENS_PLUGIN_IMPORT) {
    throw new Error("Lens plugin is not resolvable");
  }
  return (await import(LENS_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Lens Connector - Basic Validation", () => {
  it("can import the Lens plugin package", async () => {
    const mod = await loadLensPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("lens");
  });

  it("plugin has a description", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients", async () => {
    const mod = await loadLensPluginModule();
    const plugin = extractPlugin(mod) as { clients?: unknown[] } | null;

    expect(plugin?.clients).toBeDefined();
    expect(Array.isArray(plugin?.clients)).toBe(true);
    expect(plugin?.clients?.length).toBeGreaterThan(0);
  });
});
