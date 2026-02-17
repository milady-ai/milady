
/**
 * Tests for the Milady AppManager.
 *
 * The new AppManager is simple: it lists apps from the registry, installs
 * plugins via plugin-installer, and returns viewer URLs. No dynamic import,
 * no port allocation, no server management.
 */

import { logger } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppManager } from "./app-manager";

// Mock logger to avoid noise
vi.spyOn(logger, "info").mockImplementation(() => { });
vi.spyOn(logger, "warn").mockImplementation(() => { });
vi.spyOn(logger, "error").mockImplementation(() => { });

const APP_SCOPE = "@elizaos/app-";
const APP_2004SCAPE = `${APP_SCOPE}2004scape`;

type RegistryAppInfoFixture = {
  name: string;
  displayName: string;
  description: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
  npm?: {
    package?: string;
    v0Version?: string | null;
    v1Version?: string | null;
    v2Version?: string | null;
  };
  supports?: { v0: boolean; v1: boolean; v2: boolean };
};

function makeRegistryAppInfo(fixture: RegistryAppInfoFixture) {
  return {
    icon: null,
    capabilities: [],
    stars: 0,
    repository: "",
    latestVersion: "1.0.0",
    supports: fixture.supports ?? { v0: false, v1: false, v2: true },
    name: fixture.name,
    displayName: fixture.displayName,
    description: fixture.description,
    category: fixture.category ?? "game",
    launchType: fixture.launchType ?? "connect",
    launchUrl: fixture.launchUrl ?? null,
    npm: {
      package: fixture.npm?.package ?? fixture.name,
      v0Version: fixture.npm?.v0Version ?? null,
      v1Version: fixture.npm?.v1Version ?? null,
      v2Version: fixture.npm?.v2Version ?? "1.0.0",
    },
    viewer: fixture.viewer,
  };
}

const mockPluginManager = {
  refreshRegistry: vi.fn(),
  searchRegistry: vi.fn(),
  getRegistryPlugin: vi.fn(),
  listInstalledPlugins: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AppManager", () => {
  const mgr = new AppManager();

  describe("listAvailable", () => {
    it("delegates to pluginManager.refreshRegistry", async () => {
      const mockRegistry = new Map();
      mockRegistry.set("app1", { name: "app1" });
      mockPluginManager.refreshRegistry.mockResolvedValue(mockRegistry);

      const result = await mgr.listAvailable(mockPluginManager);
      expect(mockPluginManager.refreshRegistry).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "app1" });
    });
  });

  describe("search", () => {
    it("delegates to pluginManager.searchRegistry", async () => {
      mockPluginManager.searchRegistry.mockResolvedValue(["result"]);
      const result = await mgr.search(mockPluginManager, "query", 5);
      expect(mockPluginManager.searchRegistry).toHaveBeenCalledWith("query", 5);
      expect(result).toEqual(["result"]);
    });
  });

  describe("getInfo", () => {
    it("delegates to pluginManager.getRegistryPlugin", async () => {
      mockPluginManager.getRegistryPlugin.mockResolvedValue("info");
      const result = await mgr.getInfo(mockPluginManager, "app");
      expect(mockPluginManager.getRegistryPlugin).toHaveBeenCalledWith("app");
      expect(result).toBe("info");
    });
  });

  describe("launch", () => {
    it("throws when app not found", async () => {
      mockPluginManager.getRegistryPlugin.mockResolvedValue(null);
      await expect(mgr.launch(mockPluginManager, "missing")).rejects.toThrow("not found");
    });

    it("installs plugin if not installed", async () => {
      const appInfo = makeRegistryAppInfo({
        name: APP_2004SCAPE,
        displayName: "2004scape",
        description: "RuneScape",
        launchType: "connect",
        viewer: { url: "http://example.com", embedParams: {} },
      });
      mockPluginManager.getRegistryPlugin.mockResolvedValue(appInfo);
      mockPluginManager.listInstalledPlugins.mockResolvedValue([]);
      mockPluginManager.installPlugin.mockResolvedValue({
        success: true,
        version: "1.0.0",
        requiresRestart: true,
      });

      const result = await mgr.launch(mockPluginManager, APP_2004SCAPE);

      expect(mockPluginManager.installPlugin).toHaveBeenCalledWith(APP_2004SCAPE, undefined);
      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(true);
    });

    it("skips install if already installed", async () => {
      const appInfo = makeRegistryAppInfo({
        name: APP_2004SCAPE,
        displayName: "2004scape",
        description: "RuneScape",
        launchType: "connect",
        viewer: { url: "http://example.com", embedParams: {} },
      });
      mockPluginManager.getRegistryPlugin.mockResolvedValue(appInfo);
      mockPluginManager.listInstalledPlugins.mockResolvedValue([{ name: APP_2004SCAPE }]);

      const result = await mgr.launch(mockPluginManager, APP_2004SCAPE);

      expect(mockPluginManager.installPlugin).not.toHaveBeenCalled();
      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(false);
    });
  });

  describe("stop", () => {
    it("uninstalls plugin if installed", async () => {
      const appInfo = makeRegistryAppInfo({
        name: APP_2004SCAPE,
        displayName: "2004scape",
        description: "RuneScape",
      });
      mockPluginManager.getRegistryPlugin.mockResolvedValue(appInfo);
      mockPluginManager.listInstalledPlugins.mockResolvedValue([{ name: APP_2004SCAPE }]);
      mockPluginManager.uninstallPlugin.mockResolvedValue({ success: true, requiresRestart: true });

      const result = await mgr.stop(mockPluginManager, APP_2004SCAPE);

      expect(mockPluginManager.uninstallPlugin).toHaveBeenCalledWith(APP_2004SCAPE);
      expect(result.success).toBe(true);
      expect(result.pluginUninstalled).toBe(true);
    });
  });

  describe("listInstalled", () => {
    it("formats installed plugins", async () => {
      mockPluginManager.listInstalledPlugins.mockResolvedValue([
        { name: "@elizaos/plugin-test", version: "1.0.0", installedAt: "now" }
      ]);

      const result = await mgr.listInstalled(mockPluginManager);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Test");
    });
  });
});
