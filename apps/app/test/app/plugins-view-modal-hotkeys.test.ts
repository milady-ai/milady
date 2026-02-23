import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();
const mockOnWsEvent = vi.fn(() => () => {});
const mockHandlePluginToggle = vi.fn();
const mockLoadPlugins = vi.fn(async () => {});
const mockHandlePluginConfigSave = vi.fn(async () => {});
const mockSetActionNotice = vi.fn();
const mockSetState = vi.fn();
const mockInstallRegistryPlugin = vi.fn(async () => {});

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/api-client", () => ({
  client: {
    onWsEvent: (...args: unknown[]) => mockOnWsEvent(...args),
    installRegistryPlugin: (...args: unknown[]) =>
      mockInstallRegistryPlugin(...args),
    testPluginConnection: vi.fn(),
    restartAndWait: vi.fn(),
  },
}));

import { PluginsView } from "../../src/components/PluginsView";

function baseContext() {
  return {
    plugins: [
      {
        id: "test-plugin",
        name: "Test Plugin",
        description: "Plugin for modal keyboard behavior tests",
        enabled: false,
        configured: true,
        envKey: null,
        category: "feature" as const,
        source: "bundled" as const,
        parameters: [
          {
            key: "TEST_TOKEN",
            type: "string",
            description: "Test parameter",
            required: false,
            sensitive: false,
            currentValue: null,
            isSet: false,
          },
        ],
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

describe("PluginsView modal hotkeys", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockOnWsEvent.mockReset();
    mockHandlePluginToggle.mockReset();
    mockLoadPlugins.mockReset();
    mockHandlePluginConfigSave.mockReset();
    mockSetActionNotice.mockReset();
    mockSetState.mockReset();
    mockInstallRegistryPlugin.mockReset();

    mockOnWsEvent.mockReturnValue(() => {});
    mockLoadPlugins.mockResolvedValue(undefined);
    mockHandlePluginConfigSave.mockResolvedValue(undefined);
    mockInstallRegistryPlugin.mockResolvedValue(undefined);
    mockSetState.mockImplementation(() => {});
    mockUseApp.mockReturnValue(baseContext());
  });

  it("does not close settings modal on Enter/Space; closes on Escape", async () => {
    mockUseApp.mockReturnValue({
      ...baseContext(),
      pluginSettingsOpen: new Set(["test-plugin"]),
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });
    if (!tree) throw new Error("failed to render PluginsView");

    const modal = tree.root.find(
      (node) =>
        node.props.role === "dialog" &&
        typeof node.props.onKeyDown === "function",
    );

    const enterPrevent = vi.fn();
    await act(async () => {
      modal.props.onKeyDown({ key: "Enter", preventDefault: enterPrevent });
    });
    expect(enterPrevent).not.toHaveBeenCalled();
    expect(mockSetState).not.toHaveBeenCalled();

    const spacePrevent = vi.fn();
    await act(async () => {
      modal.props.onKeyDown({ key: " ", preventDefault: spacePrevent });
    });
    expect(spacePrevent).not.toHaveBeenCalled();
    expect(mockSetState).not.toHaveBeenCalled();

    const escapePrevent = vi.fn();
    await act(async () => {
      modal.props.onKeyDown({ key: "Escape", preventDefault: escapePrevent });
    });
    expect(escapePrevent).toHaveBeenCalledTimes(1);
    expect(mockSetState).toHaveBeenCalledTimes(1);
    expect(mockSetState).toHaveBeenCalledWith("pluginSettingsOpen", new Set());
  });

  it("does not close add-plugin modal on Enter/Space; closes on Escape", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(PluginsView));
    });
    if (!tree) throw new Error("failed to render PluginsView");

    const addButton = tree.root.find(
      (node) =>
        node.type === "button" &&
        typeof node.props.onClick === "function" &&
        Array.isArray(node.children) &&
        node.children.join("").includes("+ Add Plugin"),
    );

    await act(async () => {
      addButton.props.onClick();
    });

    const findDialogs = () =>
      tree.root.findAll(
        (node) =>
          node.props.role === "dialog" &&
          typeof node.props.onKeyDown === "function",
      );

    expect(findDialogs().length).toBe(1);

    const enterPrevent = vi.fn();
    await act(async () => {
      findDialogs()[0].props.onKeyDown({
        key: "Enter",
        preventDefault: enterPrevent,
      });
    });
    expect(enterPrevent).not.toHaveBeenCalled();
    expect(findDialogs().length).toBe(1);

    const spacePrevent = vi.fn();
    await act(async () => {
      findDialogs()[0].props.onKeyDown({
        key: " ",
        preventDefault: spacePrevent,
      });
    });
    expect(spacePrevent).not.toHaveBeenCalled();
    expect(findDialogs().length).toBe(1);

    const escapePrevent = vi.fn();
    await act(async () => {
      findDialogs()[0].props.onKeyDown({
        key: "Escape",
        preventDefault: escapePrevent,
      });
    });
    expect(escapePrevent).toHaveBeenCalledTimes(1);
    expect(findDialogs().length).toBe(0);
  });
});
