import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "../../api";

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
    uninstallRegistryPlugin: vi.fn(),
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

function mockAgentStatus(state: AgentStatus["state"]): AgentStatus {
  return {
    state,
    agentName: "Test Agent",
    model: "test-model",
    uptime: 1,
    startedAt: 1,
  };
}

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
    vi.mocked(client.restartAndWait).mockResolvedValue(
      mockAgentStatus("running"),
    );

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
    vi.mocked(client.restartAndWait).mockResolvedValue(
      mockAgentStatus("stopped"),
    );

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

  it("clears the selected release stream when uninstall restart never returns running", async () => {
    const context = baseContext();
    context.plugins = [
      {
        ...context.plugins[0],
        latestVersion: "2.0.0",
        alphaVersion: "2.0.0-alpha.2",
      },
    ];
    mockUseApp.mockReturnValue(context);

    vi.mocked(client.uninstallRegistryPlugin).mockResolvedValue({
      ok: true,
      pluginName: "@elizaos/plugin-test",
      requiresRestart: true,
      restartedRuntime: false,
      loadedPackages: [],
      unloadedPackages: ["@elizaos/plugin-test"],
      reloadedPackages: [],
      applied: "restart_required",
      message:
        "@elizaos/plugin-test uninstalled. Restart required to finish cleanup.",
    } as Awaited<ReturnType<typeof client.uninstallRegistryPlugin>>);
    vi.mocked(client.restartAndWait).mockResolvedValue(
      mockAgentStatus("stopped"),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });

    expect(tree).toBeDefined();

    const mainButton = tree.root.find(
      (node) =>
        node.type === "button" && String(node.props.children) === "main",
    );

    await act(async () => {
      mainButton.props.onClick({ stopPropagation: () => {} });
    });

    const uninstallButton = tree.root.find(
      (node) =>
        node.type === "button" &&
        String(node.props.children).includes("pluginsview.Uninstall"),
    );

    await act(async () => {
      uninstallButton.props.onClick({ stopPropagation: () => {} });
    });

    expect(client.uninstallRegistryPlugin).toHaveBeenCalledWith(
      "@elizaos/plugin-test",
      false,
    );
    expect(client.restartAndWait).toHaveBeenCalledWith(120_000);
    expect(mockSetActionNotice).toHaveBeenCalledWith(
      "pluginsview.PluginUninstalledRestartFailed",
      "error",
      3800,
    );

    vi.mocked(client.installRegistryPlugin).mockClear();
    vi.mocked(client.installRegistryPlugin).mockResolvedValue({
      ok: true,
      pluginName: "@elizaos/plugin-test",
      requiresRestart: false,
      restartedRuntime: false,
      loadedPackages: ["@elizaos/plugin-test"],
      unloadedPackages: [],
      reloadedPackages: [],
      applied: "hot_loaded",
      releaseStream: "alpha",
      requestedVersion: "2.0.0-alpha.2",
      latestVersion: "2.0.0",
      alphaVersion: "2.0.0-alpha.2",
      message: "@elizaos/plugin-test installed without restart.",
    } as Awaited<ReturnType<typeof client.installRegistryPlugin>>);

    const installButton = tree.root.find(
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
      { stream: "alpha" },
    );
  });
});
