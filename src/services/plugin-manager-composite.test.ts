import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the three utility modules — use vi.hoisted so refs work in factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  refreshRegistry: vi.fn(),
  getPluginInfo: vi.fn(),
  searchPlugins: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
  listInstalledPlugins: vi.fn(),
  ejectPlugin: vi.fn(),
  syncPlugin: vi.fn(),
  reinjectPlugin: vi.fn(),
  listEjectedPlugins: vi.fn(),
}));

vi.mock("./registry-client", () => ({
  refreshRegistry: mocks.refreshRegistry,
  getPluginInfo: mocks.getPluginInfo,
  searchPlugins: mocks.searchPlugins,
}));

vi.mock("./plugin-installer", () => ({
  installPlugin: mocks.installPlugin,
  uninstallPlugin: mocks.uninstallPlugin,
  listInstalledPlugins: mocks.listInstalledPlugins,
}));

vi.mock("./plugin-eject", () => ({
  ejectPlugin: mocks.ejectPlugin,
  syncPlugin: mocks.syncPlugin,
  reinjectPlugin: mocks.reinjectPlugin,
  listEjectedPlugins: mocks.listEjectedPlugins,
}));

import { createPluginManager } from "./plugin-manager-composite";
import { isPluginManagerLike } from "./plugin-manager-types";

// ---------------------------------------------------------------------------
// Fixtures — registry-client's richer type (has `git`, `appMeta`, etc.)
// ---------------------------------------------------------------------------

const REGISTRY_ENTRY = {
  name: "@elizaos/plugin-foo",
  gitRepo: "elizaos/plugin-foo",
  gitUrl: "https://github.com/elizaos/plugin-foo",
  description: "A test plugin",
  homepage: null,
  topics: ["test"],
  stars: 42,
  language: "TypeScript",
  npm: { package: "@elizaos/plugin-foo", v0Version: null, v1Version: null, v2Version: "1.0.0" },
  git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
  supports: { v0: false, v1: false, v2: true },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPluginManager", () => {
  it("passes isPluginManagerLike type guard", () => {
    const pm = createPluginManager();
    expect(isPluginManagerLike(pm)).toBe(true);
  });

  it("refreshRegistry delegates and maps types", async () => {
    mocks.refreshRegistry.mockResolvedValue(
      new Map([["@elizaos/plugin-foo", REGISTRY_ENTRY]]),
    );

    const pm = createPluginManager();
    const result = await pm.refreshRegistry();

    expect(mocks.refreshRegistry).toHaveBeenCalled();
    expect(result.size).toBe(1);

    const entry = result.get("@elizaos/plugin-foo");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("@elizaos/plugin-foo");
    // The `git` field should NOT be on the mapped type
    expect("git" in entry!).toBe(false);
  });

  it("getRegistryPlugin delegates to getPluginInfo", async () => {
    mocks.getPluginInfo.mockResolvedValue(REGISTRY_ENTRY);

    const pm = createPluginManager();
    const result = await pm.getRegistryPlugin("@elizaos/plugin-foo");

    expect(mocks.getPluginInfo).toHaveBeenCalledWith("@elizaos/plugin-foo");
    expect(result).toBeDefined();
    expect(result!.name).toBe("@elizaos/plugin-foo");
  });

  it("getRegistryPlugin returns null when not found", async () => {
    mocks.getPluginInfo.mockResolvedValue(null);

    const pm = createPluginManager();
    const result = await pm.getRegistryPlugin("@elizaos/nonexistent");

    expect(result).toBeNull();
  });

  it("searchRegistry delegates and maps results", async () => {
    mocks.searchPlugins.mockResolvedValue([
      {
        name: "@elizaos/plugin-foo",
        description: "A test plugin",
        score: 0.9,
        tags: ["test"],
        latestVersion: "1.0.0",
        stars: 42,
        supports: { v0: false, v1: false, v2: true },
        repository: "https://github.com/elizaos/plugin-foo",
      },
    ]);

    const pm = createPluginManager();
    const results = await pm.searchRegistry("foo", 10);

    expect(mocks.searchPlugins).toHaveBeenCalledWith("foo", 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("@elizaos/plugin-foo");
    expect(results[0].version).toBe("1.0.0");
    expect(results[0].npmPackage).toBe("@elizaos/plugin-foo");
  });

  it("listInstalledPlugins delegates", async () => {
    mocks.listInstalledPlugins.mockReturnValue([
      { name: "@elizaos/plugin-foo", version: "1.0.0", installPath: "/tmp/foo", installedAt: "2026-01-01" },
    ]);

    const pm = createPluginManager();
    const results = await pm.listInstalledPlugins();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("@elizaos/plugin-foo");
    expect(results[0].version).toBe("1.0.0");
  });

  it("installPlugin delegates with progress adapter", async () => {
    mocks.installPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      version: "1.0.0",
      installPath: "/tmp/foo",
      requiresRestart: true,
    });

    const pm = createPluginManager();
    const onProgress = vi.fn();
    const result = await pm.installPlugin("@elizaos/plugin-foo", onProgress);

    expect(mocks.installPlugin).toHaveBeenCalledWith(
      "@elizaos/plugin-foo",
      expect.any(Function),
    );
    expect(result.success).toBe(true);
    expect(result.requiresRestart).toBe(true);
  });

  it("uninstallPlugin delegates", async () => {
    mocks.uninstallPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      requiresRestart: true,
    });

    const pm = createPluginManager();
    const result = await pm.uninstallPlugin("@elizaos/plugin-foo");

    expect(mocks.uninstallPlugin).toHaveBeenCalledWith("@elizaos/plugin-foo");
    expect(result.success).toBe(true);
  });

  it("ejectPlugin delegates and maps result", async () => {
    mocks.ejectPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      ejectedPath: "/tmp/ejected/foo",
      upstreamCommit: "abc123",
    });

    const pm = createPluginManager();
    const result = await pm.ejectPlugin("@elizaos/plugin-foo");

    expect(result.success).toBe(true);
    expect(result.ejectedPath).toBe("/tmp/ejected/foo");
    expect(result.requiresRestart).toBe(true);
  });

  it("syncPlugin delegates and maps result", async () => {
    mocks.syncPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      ejectedPath: "/tmp/ejected/foo",
      upstreamCommits: 3,
      localChanges: false,
      conflicts: [],
      commitHash: "def456",
    });

    const pm = createPluginManager();
    const result = await pm.syncPlugin("@elizaos/plugin-foo");

    expect(result.success).toBe(true);
    expect(result.requiresRestart).toBe(true); // upstreamCommits > 0
  });

  it("syncPlugin sets requiresRestart false when no upstream changes", async () => {
    mocks.syncPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      ejectedPath: "/tmp/ejected/foo",
      upstreamCommits: 0,
      localChanges: false,
      conflicts: [],
      commitHash: "same",
    });

    const pm = createPluginManager();
    const result = await pm.syncPlugin("@elizaos/plugin-foo");

    expect(result.requiresRestart).toBe(false);
  });

  it("reinjectPlugin delegates and maps result", async () => {
    mocks.reinjectPlugin.mockResolvedValue({
      success: true,
      pluginName: "@elizaos/plugin-foo",
      removedPath: "/tmp/ejected/foo",
    });

    const pm = createPluginManager();
    const result = await pm.reinjectPlugin("@elizaos/plugin-foo");

    expect(result.success).toBe(true);
    expect(result.requiresRestart).toBe(true);
  });

  it("listEjectedPlugins delegates and maps results", async () => {
    mocks.listEjectedPlugins.mockResolvedValue([
      { name: "@elizaos/plugin-foo", path: "/tmp/ejected/foo", version: "1.0.0", upstream: null },
    ]);

    const pm = createPluginManager();
    const results = await pm.listEjectedPlugins();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("@elizaos/plugin-foo");
    expect(results[0].version).toBe("1.0.0");
  });
});
