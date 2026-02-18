import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "./plugin-manager-types";
import { AppManager } from "./app-manager";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APP_NAME = "@elizaos/app-example";
const APP_PLUGIN_NAME = "@elizaos/plugin-example";

const APP_REGISTRY_ENTRY: RegistryPluginInfo = {
  name: APP_NAME,
  gitRepo: "elizaos/app-example",
  gitUrl: "https://github.com/elizaos/app-example",
  description: "An example app",
  topics: ["app"],
  stars: 10,
  language: "TypeScript",
  npm: { package: APP_PLUGIN_NAME, v0Version: null, v1Version: null, v2Version: "1.0.0" },
  supports: { v0: true, v1: false, v2: false },
};

// ---------------------------------------------------------------------------
// Mock factory (matches pattern from apps-routes.test.ts)
// ---------------------------------------------------------------------------

function createPluginManagerMock(
  overrides: Partial<PluginManagerLike> = {},
): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(async () => new Map([[APP_NAME, APP_REGISTRY_ENTRY]])),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async (name: string) =>
      name === APP_NAME ? APP_REGISTRY_ENTRY : null,
    ),
    searchRegistry: vi.fn(async () => []),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_PLUGIN_NAME,
      version: "1.0.0",
      installPath: "/tmp/plugins/installed/_elizaos_plugin-example",
      requiresRestart: true,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: APP_PLUGIN_NAME,
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(),
    syncPlugin: vi.fn(),
    reinjectPlugin: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppManager Integration", () => {
  let appManager: AppManager;

  beforeEach(() => {
    appManager = new AppManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("launches an app directly if plugin is already installed", async () => {
    const pluginManager = createPluginManagerMock({
      listInstalledPlugins: vi.fn(async () => [
        { name: APP_PLUGIN_NAME, version: "1.0.0" },
      ]),
    });

    const result = await appManager.launch(pluginManager, APP_NAME);

    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(false);
    // installPlugin should NOT have been called since it was already installed
    expect(pluginManager.installPlugin).not.toHaveBeenCalled();
  });

  it("installs plugin if not installed", async () => {
    const pluginManager = createPluginManagerMock();

    const result = await appManager.launch(pluginManager, APP_NAME);

    expect(pluginManager.installPlugin).toHaveBeenCalledWith(
      APP_PLUGIN_NAME,
      undefined,
    );
    expect(result.pluginInstalled).toBe(true);
    expect(result.needsRestart).toBe(true);
  });

  it("throws if plugin installation fails", async () => {
    const pluginManager = createPluginManagerMock({
      installPlugin: vi.fn(async () => ({
        success: false,
        pluginName: APP_PLUGIN_NAME,
        version: "",
        installPath: "",
        requiresRestart: false,
        error: "npm install failed",
      })),
    });

    await expect(
      appManager.launch(pluginManager, APP_NAME),
    ).rejects.toThrow(/Failed to install plugin/);
  });

  it("throws if app is not found in registry", async () => {
    const pluginManager = createPluginManagerMock({
      getRegistryPlugin: vi.fn(async () => null),
    });

    await expect(
      appManager.launch(pluginManager, "@elizaos/app-nonexistent"),
    ).rejects.toThrow(/not found in the registry/);
  });

  it("stops an app by uninstalling its plugin", async () => {
    const pluginManager = createPluginManagerMock({
      listInstalledPlugins: vi.fn(async () => [
        { name: APP_PLUGIN_NAME, version: "1.0.0" },
      ]),
    });

    const result = await appManager.stop(pluginManager, APP_NAME);

    expect(result.success).toBe(true);
    expect(result.pluginUninstalled).toBe(true);
    expect(pluginManager.uninstallPlugin).toHaveBeenCalledWith(APP_PLUGIN_NAME);
  });

  it("returns no-op when stopping app that is not installed", async () => {
    const pluginManager = createPluginManagerMock();

    const result = await appManager.stop(pluginManager, APP_NAME);

    expect(result.success).toBe(false);
    expect(result.pluginUninstalled).toBe(false);
    expect(pluginManager.uninstallPlugin).not.toHaveBeenCalled();
  });

  it("throws when stopping an app not in registry", async () => {
    const pluginManager = createPluginManagerMock({
      getRegistryPlugin: vi.fn(async () => null),
    });

    await expect(
      appManager.stop(pluginManager, "@elizaos/app-nonexistent"),
    ).rejects.toThrow(/not found in the registry/);
  });
});
