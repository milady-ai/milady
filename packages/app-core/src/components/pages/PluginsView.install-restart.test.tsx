import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginToggle = vi.fn();
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockEnsurePluginManagerAllowed = vi.fn(async () => "already-enabled");
const mockGetPluginManagerBlockReason = vi.fn(() => null);

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../api", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: vi.fn(),
    testPluginConnection: vi.fn(),
    restartAndWait: vi.fn(),
  },
}));

vi.mock("../../runtime/plugin-manager-guard", () => ({
  ensurePluginManagerAllowed: (...args: unknown[]) =>
    mockEnsurePluginManagerAllowed(...args),
  getPluginManagerBlockReason: (...args: unknown[]) =>
    mockGetPluginManagerBlockReason(...args),
  PLUGIN_MANAGER_UNAVAILABLE_ERROR: "Plugin manager service not found",
}));

import { client } from "../../api";
import { PluginsView } from "./PluginsView";

function baseContext() {
  return {
    t: (k: string) => k,
    plugins: [
      {
        id: "test-plugin",
        name: "Test Plugin",
        description: "Plugin for install UX tests",
        enabled: true,
        isActive: false,
        configured: true,
        envKey: null,
        category: "feature" as const,
        source: "store" as const,
        npmName: "@elizaos/plugin-test",
        version: "2.0.0-alpha.1",
        latestVersion: "2.0.0-alpha.2",
        parameters: [],
        validationErrors: [],
        validationWarnings: [],
      },
    ],
    pluginStatusFilter: "all" as const,
    pluginSearch: "",
    pluginSettingsOpen: new Set<string>(),
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: mockLoadPlugins,
    handlePluginToggle: mockHandlePluginToggle,
    handlePluginConfigSave: mockHandlePluginConfigSave,
    setActionNotice: mockSetActionNotice,
    setState: mockSetState,
  };
}

describe("PluginsView plugin install restart flow", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset();
    mockLoadPlugins.mockReset();
    mockHandlePluginToggle.mockReset();
    mockHandlePluginConfigSave.mockReset();
    mockSetActionNotice.mockReset();
    mockSetState.mockReset();
    mockEnsurePluginManagerAllowed.mockReset();
    mockGetPluginManagerBlockReason.mockReset();

    mockOnWsEvent.mockReturnValue(() => {});
    mockLoadPlugins.mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockResolvedValue(undefined);
    mockSetState.mockImplementation(() => {});
    mockEnsurePluginManagerAllowed.mockResolvedValue("already-enabled");
    mockGetPluginManagerBlockReason.mockReturnValue(null);
    mockUseApp.mockReturnValue(baseContext());
  });

  it("auto-restarts and reloads after an install that requires restart", async () => {
    vi.mocked(client.installRegistryPlugin).mockResolvedValue({
      ok: true,
      pluginName: "@elizaos/plugin-test",
      requiresRestart: true,
      restartedRuntime: false,
      loadedPackages: [],
      unloadedPackages: [],
      reloadedPackages: [],
      applied: "restart_required",
      releaseStream: "alpha",
      requestedVersion: "2.0.0-alpha.2",
      latestVersion: "2.0.0-alpha.2",
      alphaVersion: "2.0.0-alpha.2",
      message: "@elizaos/plugin-test installed. Restart required to activate.",
    } as Awaited<ReturnType<typeof client.installRegistryPlugin>>);
    vi.mocked(client.restartAndWait).mockResolvedValue({
      state: "running",
      startupPhase: "running",
      status: "running",
      healthy: true,
    } as Awaited<ReturnType<typeof client.restartAndWait>>);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });
    mockLoadPlugins.mockClear();
    mockSetActionNotice.mockClear();

    const installButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        String(node.props.children).includes("pluginsview.Install"),
    );

    await act(async () => {
      installButton.props.onClick({ stopPropagation: () => {} });
    });

    expect(client.installRegistryPlugin).toHaveBeenCalledWith(
      "@elizaos/plugin-test",
      false,
      { stream: "latest" },
    );
    expect(client.restartAndWait).toHaveBeenCalledWith(120_000);
    expect(mockLoadPlugins).toHaveBeenCalled();
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "pluginsview.PluginInstalledRestarting",
      "info",
      120_000,
      false,
      true,
    );
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "pluginsview.PluginInstalledRestartComplete",
      "success",
    );
  });

  it("shows an error and does not claim activation when restart never returns running", async () => {
    vi.mocked(client.installRegistryPlugin).mockResolvedValue({
      ok: true,
      pluginName: "@elizaos/plugin-test",
      requiresRestart: true,
      restartedRuntime: false,
      loadedPackages: [],
      unloadedPackages: [],
      reloadedPackages: [],
      applied: "restart_required",
      releaseStream: "alpha",
      requestedVersion: "2.0.0-alpha.2",
      latestVersion: "2.0.0-alpha.2",
      alphaVersion: "2.0.0-alpha.2",
      message: "@elizaos/plugin-test installed. Restart required to activate.",
    } as Awaited<ReturnType<typeof client.installRegistryPlugin>>);
    vi.mocked(client.restartAndWait).mockResolvedValue({
      state: "stopped",
      startupPhase: "stopped",
      status: "stopped",
      healthy: false,
    } as Awaited<ReturnType<typeof client.restartAndWait>>);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    const installButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        String(node.props.children).includes("pluginsview.Install"),
    );

    await act(async () => {
      installButton.props.onClick({ stopPropagation: () => {} });
    });

    expect(client.restartAndWait).toHaveBeenCalledWith(120_000);
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "pluginsview.PluginInstalledRestarting",
      "info",
      120_000,
      false,
      true,
    );
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "pluginsview.PluginInstalledRestartFailed",
      "error",
      3800,
    );
    expect(mockSetActionNotice).not.toHaveBeenCalledWith(
      "pluginsview.PluginInstalledRestartComplete",
      "success",
    );
  });
});
