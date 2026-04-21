import { describe, expect, it, vi } from "vitest";
import type { Plugin } from "@elizaos/core";
import { applyPluginRuntimeMutation } from "./plugin-runtime-apply";
import type { ResolvedPlugin } from "../runtime/eliza";

function createResolvedPlugin(
  packageName: string,
  plugin: Plugin,
): ResolvedPlugin {
  return {
    name: packageName,
    plugin,
    source: "static",
  } as ResolvedPlugin;
}

function createLifecycleRuntime(overrides: Record<string, unknown> = {}) {
  return {
    plugins: [],
    registerPlugin: vi.fn(async () => {}),
    unloadPlugin: vi.fn(async () => null),
    reloadPlugin: vi.fn(async () => {}),
    applyPluginConfig: vi.fn(async () => false),
    getPluginOwnership: vi.fn(() => null),
    ...overrides,
  };
}

describe("applyPluginRuntimeMutation", () => {
  it("applies plugin config in place when the runtime supports applyPluginConfig", async () => {
    const runtime = createLifecycleRuntime({
      applyPluginConfig: vi.fn(async () => true),
    });
    const plugin = {
      name: "plugin-example",
      description: "Example plugin",
    } satisfies Plugin;

    const result = await applyPluginRuntimeMutation({
      runtime: runtime as never,
      previousConfig: {} as never,
      nextConfig: {} as never,
      previousResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-example", plugin),
      ],
      nextResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-example", plugin),
      ],
      changedPluginId: "example",
      config: { EXAMPLE_API_KEY: "secret" },
      reason: "config-save",
    });

    expect(result.mode).toBe("config_apply");
    expect(result.appliedConfigPackage).toBe("@elizaos/plugin-example");
    expect(result.requiresRestart).toBe(false);
    expect(runtime.applyPluginConfig).toHaveBeenCalledWith("plugin-example", {
      EXAMPLE_API_KEY: "secret",
    });
    expect(runtime.unloadPlugin).not.toHaveBeenCalled();
    expect(runtime.registerPlugin).not.toHaveBeenCalled();
  });

  it("reloads only the affected plugin when config changes require a plugin reload", async () => {
    const runtime = createLifecycleRuntime();
    const plugin = {
      name: "plugin-example",
      description: "Example plugin",
    } satisfies Plugin;

    const result = await applyPluginRuntimeMutation({
      runtime: runtime as never,
      previousConfig: {} as never,
      nextConfig: {} as never,
      previousResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-example", plugin),
      ],
      nextResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-example", plugin),
      ],
      changedPluginPackage: "@elizaos/plugin-example",
      config: { EXAMPLE_FLAG: "1" },
      reason: "config-save",
    });

    expect(result.mode).toBe("plugin_reload");
    expect(result.requiresRestart).toBe(false);
    expect(result.unloadedPackages).toEqual(["@elizaos/plugin-example"]);
    expect(result.reloadedPackages).toEqual(["@elizaos/plugin-example"]);
    expect(runtime.unloadPlugin).toHaveBeenCalledWith("plugin-example");
    expect(runtime.registerPlugin).toHaveBeenCalledWith(plugin);
  });

  it("unloads removed plugins without a runtime restart", async () => {
    const runtime = createLifecycleRuntime();
    const plugin = {
      name: "plugin-example",
      description: "Example plugin",
    } satisfies Plugin;

    const result = await applyPluginRuntimeMutation({
      runtime: runtime as never,
      previousConfig: {} as never,
      nextConfig: {} as never,
      previousResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-example", plugin),
      ],
      nextResolvedPlugins: [],
      changedPluginPackage: "@elizaos/plugin-example",
      reason: "disable-plugin",
    });

    expect(result.mode).toBe("plugin_reload");
    expect(result.unloadedPackages).toEqual(["@elizaos/plugin-example"]);
    expect(result.loadedPackages).toEqual([]);
    expect(result.reloadedPackages).toEqual([]);
    expect(runtime.unloadPlugin).toHaveBeenCalledWith("plugin-example");
    expect(runtime.registerPlugin).not.toHaveBeenCalled();
  });

  it("falls back to a runtime reload when a changed plugin owns the adapter", async () => {
    const restartRuntime = vi.fn(async () => true);
    const runtime = createLifecycleRuntime();
    const plugin = {
      name: "plugin-sql",
      description: "Database plugin",
      adapter: vi.fn(),
    } satisfies Plugin;

    const result = await applyPluginRuntimeMutation({
      runtime: runtime as never,
      previousConfig: {} as never,
      nextConfig: {} as never,
      previousResolvedPlugins: [
        createResolvedPlugin("@elizaos/plugin-sql", plugin),
      ],
      nextResolvedPlugins: [],
      changedPluginPackage: "@elizaos/plugin-sql",
      reason: "disable-plugin",
      restartRuntime,
    });

    expect(result.mode).toBe("runtime_reload");
    expect(result.restartedRuntime).toBe(true);
    expect(result.requiresRestart).toBe(false);
    expect(restartRuntime).toHaveBeenCalledWith("disable-plugin");
    expect(runtime.unloadPlugin).not.toHaveBeenCalled();
  });

  it("requires a restart when an install or uninstall changed config but the resolved graph cannot prove the delta", async () => {
    const runtime = createLifecycleRuntime({
      plugins: undefined,
    });

    const result = await applyPluginRuntimeMutation({
      runtime: runtime as never,
      previousConfig: {} as never,
      nextConfig: {} as never,
      previousResolvedPlugins: [],
      nextResolvedPlugins: [],
      changedPluginPackage: "@elizaos/plugin-missing-build",
      expectRuntimeGraphChange: true,
      reason: "plugin-install",
    });

    expect(result.mode).toBe("restart_required");
    expect(result.requiresRestart).toBe(true);
    expect(result.restartedRuntime).toBe(false);
    expect(runtime.unloadPlugin).not.toHaveBeenCalled();
    expect(runtime.registerPlugin).not.toHaveBeenCalled();
  });
});
