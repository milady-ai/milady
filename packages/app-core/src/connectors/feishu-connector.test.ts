/**
 * Feishu Connector Unit Tests — GitHub Issue #155
 *
 * Basic validation tests for the Feishu/Lark connector plugin.
 * For comprehensive e2e tests, see test/feishu-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFeishuPluginImportSpecifier,
} from "../test-support/test-helpers";

const FEISHU_PLUGIN_IMPORT = resolveFeishuPluginImportSpecifier();
const FEISHU_PLUGIN_AVAILABLE = FEISHU_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = FEISHU_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadFeishuPluginModule = async () => {
  if (!FEISHU_PLUGIN_IMPORT) {
    throw new Error("Feishu plugin is not resolvable");
  }
  return (await import(FEISHU_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Feishu Connector - Basic Validation", () => {
  it("can import the Feishu plugin package", async () => {
    const mod = await loadFeishuPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toMatch(/feishu/i);
  });

  it("plugin has a description", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadFeishuPluginModule();
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
