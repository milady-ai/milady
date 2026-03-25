// @vitest-environment jsdom

import type {
  AppLaunchResult,
  AppViewerAuthMessage,
  RegistryAppInfo,
} from "@miladyai/app-core/api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findButtonByText,
  flush,
  text,
} from "../../../../test/helpers/react-test";

interface AppsContextStub {
  setState: (
    key: string,
    value: string | boolean | AppViewerAuthMessage | null,
  ) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    getCodingAgentStatus: vi.fn(async () => null),
    listApps: vi.fn(),
    listInstalledApps: vi.fn(),
    launchApp: vi.fn(),
    listHyperscapeEmbeddedAgents: vi.fn(),
    getHyperscapeAgentGoal: vi.fn(),
    getHyperscapeAgentQuickActions: vi.fn(),
    createHyperscapeEmbeddedAgent: vi.fn(),
    controlHyperscapeEmbeddedAgent: vi.fn(),
    sendHyperscapeAgentMessage: vi.fn(),
    sendHyperscapeEmbeddedAgentCommand: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
}));
vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import {
  AppsView,
  shouldShowAppInAppsView,
} from "../../src/components/AppsView";

function createApp(
  name: string,
  displayName: string,
  description: string,
  overrides: Partial<RegistryAppInfo> = {},
): RegistryAppInfo {
  return {
    name,
    displayName,
    description,
    category: "app",
    launchType: "connect",
    launchUrl: `https://example.com/${displayName.toLowerCase()}`,
    icon: null,
    capabilities: ["observe"],
    stars: 1,
    repository: "https://github.com/example/repo",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: name,
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    ...overrides,
  };
}

function createLaunchResult(
  overrides?: Partial<AppLaunchResult>,
): AppLaunchResult {
  return {
    pluginInstalled: true,
    needsRestart: false,
    displayName: "Test App",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer: {
      url: "https://example.com/viewer",
      postMessageAuth: false,
      sandbox: "allow-scripts",
    },
    ...overrides,
  };
}

function findButtonByTitle(
  root: TestRenderer.ReactTestInstance,
  title: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && node.props.title === title,
  );
  if (!matches[0]) {
    throw new Error(`Button titled "${title}" not found`);
  }
  return matches[0];
}

function findButtonContainingText(
  root: TestRenderer.ReactTestInstance,
  value: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node).includes(value),
  );
  if (!matches[0]) {
    throw new Error(`Button containing "${value}" not found`);
  }
  return matches[0];
}

function _findTextareaByPlaceholder(
  root: TestRenderer.ReactTestInstance,
  placeholder: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) =>
      node.type === "textarea" && node.props.placeholder === placeholder,
  );
  if (!matches[0]) {
    throw new Error(`Textarea "${placeholder}" not found`);
  }
  return matches[0];
}

async function _waitFor(
  predicate: () => boolean,
  message: string,
  attempts = 20,
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(message);
}

describe("AppsView", () => {
  beforeEach(() => {
    mockClientFns.listApps.mockReset();
    mockClientFns.listInstalledApps.mockReset();
    mockClientFns.launchApp.mockReset();
    mockClientFns.listHyperscapeEmbeddedAgents.mockReset();
    mockClientFns.getHyperscapeAgentGoal.mockReset();
    mockClientFns.getHyperscapeAgentQuickActions.mockReset();
    mockClientFns.createHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.controlHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.sendHyperscapeAgentMessage.mockReset();
    mockClientFns.sendHyperscapeEmbeddedAgentCommand.mockReset();
    mockUseApp.mockReset();

    mockClientFns.listHyperscapeEmbeddedAgents.mockResolvedValue({
      success: true,
      agents: [],
      count: 0,
    });
    mockClientFns.getHyperscapeAgentGoal.mockResolvedValue({
      success: true,
      goal: null,
      availableGoals: [],
    });
    mockClientFns.getHyperscapeAgentQuickActions.mockResolvedValue({
      success: true,
      nearbyLocations: [],
      availableGoals: [],
      quickCommands: [],
      inventory: [],
      playerPosition: null,
    });
    mockClientFns.createHyperscapeEmbeddedAgent.mockResolvedValue({
      success: true,
      message: "created",
    });
    mockClientFns.controlHyperscapeEmbeddedAgent.mockResolvedValue({
      success: true,
      message: "ok",
    });
    mockClientFns.sendHyperscapeAgentMessage.mockResolvedValue({
      success: true,
      message: "sent",
    });
    mockClientFns.sendHyperscapeEmbeddedAgentCommand.mockResolvedValue({
      success: true,
      message: "command sent",
    });
    mockClientFns.listInstalledApps.mockResolvedValue([]);
  });

  const tStub = (k: string) => k;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an exact clawbal allowlist in production", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@iqlabs-official/plugin-clawbal", "Clawbal", "Game"),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("evil-clawbal", "Spoof", "Spoofed package"),
        true,
      ),
    ).toBe(false);
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena"),
        true,
      ),
    ).toBe(false);
  });

  it("does not restrict the apps list by clawbal in development", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena"),
        false,
      ),
    ).toBe(true);
  });

  it("loads apps and launches iframe viewer flow", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    const t = (k: string) => {
      if (k === "appsview.Active") return "Active";
      if (k === "appsview.Back") return "Back";
      if (k === "appsview.Refresh") return "Refresh";
      if (k === "appsview.ActiveOnly") return "Active Only";
      if (k === "appsview.SaySomethingToSel")
        return "Say something to selected agent...";
      return k;
    };
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: {
          url: "http://localhost:5175",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: true,
          authMessage: { type: "HYPERSCAPE_AUTH", authToken: "token-1" },
        },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const launchButton = findButtonByText(tree?.root, "appsview.Launch");
    await act(async () => {
      await launchButton.props.onClick();
    });

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
    expect(setState).toHaveBeenCalledWith("activeGameApp", app.name);
    expect(setState).toHaveBeenCalledWith(
      "activeGameDisplayName",
      app.displayName,
    );
    expect(setState).toHaveBeenCalledWith(
      "activeGameViewerUrl",
      "http://localhost:5175",
    );
    expect(setState).toHaveBeenCalledWith("activeGamePostMessageAuth", true);
    expect(setState).toHaveBeenCalledWith("tab", "apps");
    expect(setState).toHaveBeenCalledWith("appsSubTab", "games");
    expect(
      setActionNotice.mock.calls.some((call) =>
        String(call[0]).includes("requires iframe auth"),
      ),
    ).toBe(false);
  });

  it("shows auth warning when postMessage auth payload is missing", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: {
          url: "http://localhost:5175",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: true,
        },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(setActionNotice).toHaveBeenCalledWith(
      expect.stringContaining("requires iframe auth"),
      "error",
      4800,
    );
    expect(setState).toHaveBeenCalledWith("tab", "apps");
    expect(setState).toHaveBeenCalledWith("appsSubTab", "games");
  });

  it("opens non-viewer launches in a new tab and resets active game state", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
      }),
    );

    const popupSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(popupSpy).toHaveBeenCalledWith(
      "https://example.com/babylon",
      "_blank",
      "noopener,noreferrer",
    );
    expect(setState).toHaveBeenCalledWith("activeGameApp", "");
    expect(setState).toHaveBeenCalledWith("activeGameViewerUrl", "");
    expect(setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
  });

  it("reports popup-blocked errors and launch failures", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp
      .mockResolvedValueOnce(
        createLaunchResult({
          displayName: app.displayName,
          launchUrl: "https://example.com/babylon",
          viewer: null,
        }),
      )
      .mockRejectedValueOnce(new Error("network down"));

    vi.spyOn(window, "open").mockReturnValue(null);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });
    expect(setActionNotice).toHaveBeenCalledWith(
      "Popup blocked while opening Babylon. Allow popups and try again.",
      "error",
      4200,
    );

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });
    expect(setActionNotice).toHaveBeenCalledWith(
      "Failed to launch Babylon: network down",
      "error",
      4000,
    );
  });

  it("uses the Electrobun shell bridge for external app launches", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    const request = vi.fn(async () => undefined);
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
      }),
    );
    Object.defineProperty(window, "__MILADY_ELECTROBUN_RPC__", {
      configurable: true,
      writable: true,
      value: {
        request: { desktopOpenExternal: request },
        onMessage: vi.fn(),
        offMessage: vi.fn(),
      },
    });
    const popupSpy = vi.spyOn(window, "open");

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "appsview.Launch").props.onClick();
    });

    expect(request).toHaveBeenCalledWith({
      url: "https://example.com/babylon",
    });
    expect(popupSpy).not.toHaveBeenCalled();
    expect(setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
  });

  it("refreshes list and applies search filtering", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const appOne = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);
    mockClientFns.listInstalledApps.mockResolvedValue([
      {
        name: appOne.name,
        displayName: appOne.displayName,
        version: "1.0.0",
        installPath: "/tmp/app-one",
        installedAt: "2026-01-01T00:00:00.000Z",
        isRunning: true,
      },
    ]);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const root = tree?.root;
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(1);
    expect(
      root.findAll((node) => text(node) === "appsview.Active").length,
    ).toBeGreaterThanOrEqual(1);

    const searchInput = root.findByType("input");
    await act(async () => {
      searchInput.props.onChange({ target: { value: "hyper" } });
    });
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(0);

    await act(async () => {
      await findButtonByText(root, "common.refresh").props.onClick();
    });
    expect(mockClientFns.listApps).toHaveBeenCalledTimes(2);

    await act(async () => {
      searchInput.props.onChange({ target: { value: "" } });
    });
    await act(async () => {
      await findButtonByText(root, "appsview.ActiveOnly").props.onClick();
    });
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(0);
  });

  it("opens detail pane for app with unregistered uiExtension without crashing", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena", {
      uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
    });
    mockClientFns.listApps.mockResolvedValue([app]);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Hyperscape").props.onClick();
    });
    await flush();

    // The detail pane should render with a Back button and app name
    expect(
      tree?.root.findAll((node) => text(node).includes("appsview.Back")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll((node) => text(node) === "Hyperscape").length,
    ).toBeGreaterThan(0);

    // The extension panel ID is not registered, so no extension UI should render.
    // Hyperscape API calls should NOT be made when the extension is absent.
    expect(mockClientFns.listHyperscapeEmbeddedAgents).not.toHaveBeenCalled();
  });

  it("applies the selected launcher tile treatment after opening an app", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.listInstalledApps.mockResolvedValue([
      {
        name: app.name,
        displayName: app.displayName,
        version: "1.0.0",
        installPath: "/tmp/hyperscape",
        installedAt: "2026-01-01T00:00:00.000Z",
        isRunning: true,
      },
    ]);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Hyperscape").props.onClick();
    });

    const selectedButton = findButtonByTitle(tree?.root, "Open Hyperscape");
    expect(selectedButton.props.className).toContain("rounded-2xl");
    expect(selectedButton.props.className).toContain("border-accent/35");
    expect(selectedButton.props.className).toContain("bg-accent/10");
  });

  it("opens app details and can return to the app list", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
      t: tStub,
      setState,
      setActionNotice,
    });
    const appOne = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Open Babylon").props.onClick();
    });
    expect(
      tree?.root.findAll((node) => text(node).includes("appsview.Back")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll((node) => text(node) === "Babylon").length,
    ).toBeGreaterThan(0);

    await act(async () => {
      findButtonContainingText(tree?.root, "appsview.Back").props.onClick();
    });
    expect(
      tree?.root.findAll(
        (node) => text(node) === "Select an app to view details",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      tree?.root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Open Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      tree?.root.findAll(
        (node) => node.type === "button" && node.props.title === "Open Babylon",
      ).length,
    ).toBe(1);
  });
});
