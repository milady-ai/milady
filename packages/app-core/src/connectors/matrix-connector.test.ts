/**
 * Matrix Connector Unit Tests — GitHub Issue #156
 *
 * Basic validation tests for the Matrix connector plugin.
 * For comprehensive e2e tests, see test/matrix-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveMatrixPluginImportSpecifier,
} from "../test-support/test-helpers";

const MATRIX_PLUGIN_IMPORT = resolveMatrixPluginImportSpecifier();
const MATRIX_PLUGIN_AVAILABLE = MATRIX_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = MATRIX_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadMatrixPluginModule = async () => {
  if (!MATRIX_PLUGIN_IMPORT) {
    throw new Error("Matrix plugin is not resolvable");
  }
  return (await import(MATRIX_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Matrix Connector - Basic Validation", () => {
  it("can import the Matrix plugin package", async () => {
    const mod = await loadMatrixPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("matrix");
  });

  it("plugin has a description", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadMatrixPluginModule();
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
