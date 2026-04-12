// @vitest-environment jsdom

import type {
  AppLaunchResult,
  AppRunSummary,
  RegistryAppInfo,
} from "@miladyai/app-core/api";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findButtonByText,
  flush,
  text,
  textOf,
} from "../../../../../test/helpers/react-test";

interface AppsContextStub {
  appRuns: AppRunSummary[];
  activeGameRunId: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  appsSubTab: "browse" | "running" | "games";
  favoriteApps: string[];
  setState: (key: string, value: unknown) => void;
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
    listAppRuns: vi.fn(),
    launchApp: vi.fn(),
    attachAppRun: vi.fn(),
    detachAppRun: vi.fn(),
    stopAppRun: vi.fn(),
    listHyperscapeEmbeddedAgents: vi.fn(),
    getHyperscapeAgentGoal: vi.fn(),
    getHyperscapeAgentQuickActions: vi.fn(),
    createHyperscapeEmbeddedAgent: vi.fn(),
    controlHyperscapeEmbeddedAgent: vi.fn(),
    sendHyperscapeAgentMessage: vi.fn(),
    sendHyperscapeEmbeddedAgentCommand: vi.fn(),
    getBabylonAgentStatus: vi.fn(),
    getBabylonAgentSummary: vi.fn(),
    getBabylonAgentGoals: vi.fn(),
    getBabylonAgentRecentTrades: vi.fn(),
    getBabylonPredictionMarkets: vi.fn(),
    getBabylonTeamDashboard: vi.fn(),
    getBabylonTeamConversations: vi.fn(),
    getBabylonAgentChat: vi.fn(),
    getBabylonAgentWallet: vi.fn(),
    getBabylonAgentTradingBalance: vi.fn(),
    controlAppRun: vi.fn(),
    sendAppRunMessage: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

const {
  mockGetInternalToolAppCatalogOrder,
  mockGetInternalToolAppTargetTab,
  mockInternalToolApps,
  mockIsInternalToolApp,
} = vi.hoisted(() => ({
  mockGetInternalToolAppCatalogOrder: vi.fn((name: string) =>
    name === "@miladyai/app-plugin-viewer" ? 0 : Number.MAX_SAFE_INTEGER,
  ),
  mockGetInternalToolAppTargetTab: vi.fn((name: string) =>
    name === "@miladyai/app-plugin-viewer" ? "plugins" : null,
  ),
  mockInternalToolApps: vi.fn(() => []),
  mockIsInternalToolApp: vi.fn(
    (name: string) => name === "@miladyai/app-plugin-viewer",
  ),
}));

const mockGoogleConnector = {
  activeMode: "cloud_managed",
  actionPending: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  error: null,
  loading: false,
  modeOptions: ["cloud_managed", "local"],
  refresh: vi.fn(),
  selectMode: vi.fn(),
  selectedMode: "cloud_managed",
  side: "owner",
  status: {
    provider: "google",
    side: "owner",
    mode: "cloud_managed",
    defaultMode: "cloud_managed",
    availableModes: ["cloud_managed", "local"],
    executionTarget: "cloud",
    sourceOfTruth: "cloud_connection",
    configured: false,
    connected: false,
    reason: "disconnected",
    preferredByAgent: false,
    cloudConnectionId: null,
    identity: null,
    grantedCapabilities: [],
    grantedScopes: [],
    expiresAt: null,
    hasRefreshToken: false,
    grant: null,
  },
};

let originalMatchMedia: typeof window.matchMedia | undefined;

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
}));
vi.mock("../../hooks", () => ({
  useGoogleLifeOpsConnector: vi.fn(() => mockGoogleConnector),
}));
vi.mock("../apps/internal-tool-apps", () => ({
  getInternalToolAppCatalogOrder: (name: string) =>
    mockGetInternalToolAppCatalogOrder(name),
  getInternalToolAppTargetTab: (name: string) =>
    mockGetInternalToolAppTargetTab(name),
  getInternalToolApps: () => mockInternalToolApps(),
  isInternalToolApp: (name: string) => mockIsInternalToolApp(name),
}));
vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { AppsView, shouldShowAppInAppsView } from "./AppsView";

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
  const viewer =
    overrides?.viewer === undefined
      ? {
          url: "https://example.com/viewer",
          postMessageAuth: false,
          sandbox: "allow-scripts",
        }
      : overrides.viewer;
  const session = overrides?.session ?? null;
  const run =
    overrides?.run ??
    createRunSummary({
      appName: "@elizaos/app-test",
      displayName: overrides?.displayName ?? "Test App",
      launchType: overrides?.launchType ?? "connect",
      launchUrl:
        overrides?.launchUrl === undefined
          ? "https://example.com/launch"
          : overrides.launchUrl,
      viewer,
      session,
      viewerAttachment: viewer ? "attached" : "unavailable",
      status: session?.status ?? (viewer ? "running" : "idle"),
      summary: session?.summary ?? (viewer ? "Viewer ready." : "Run active."),
    });
  return {
    pluginInstalled: true,
    needsRestart: false,
    displayName: "Test App",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer,
    session,
    run,
    ...overrides,
  };
}

function createRunSummary(
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@elizaos/app-test",
    displayName: "Test App",
    pluginName: "@elizaos/app-test",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer: {
      url: "https://example.com/viewer",
      postMessageAuth: false,
      sandbox: "allow-scripts",
    },
    session: null,
    status: "running",
    summary: "Viewer ready.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:00.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: null,
    },
    ...overrides,
  };
}

function createAppsContext(
  overrides: Partial<AppsContextStub> = {},
): AppsContextStub {
  return {
    appRuns: [],
    activeGameRunId: "",
    activeGameDisplayName: "",
    activeGameViewerUrl: "",
    appsSubTab: "browse",
    favoriteApps: [],
    setState: vi.fn<AppsContextStub["setState"]>(),
    setActionNotice: vi.fn<AppsContextStub["setActionNotice"]>(),
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
    // Prevent jsdom mock leakages between files
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
    mockClientFns.listApps.mockReset();
    mockClientFns.listInstalledApps.mockReset();
    mockClientFns.listAppRuns.mockReset();
    mockClientFns.launchApp.mockReset();
    mockClientFns.attachAppRun.mockReset();
    mockClientFns.detachAppRun.mockReset();
    mockClientFns.stopAppRun.mockReset();
    mockClientFns.listHyperscapeEmbeddedAgents.mockReset();
    mockClientFns.getHyperscapeAgentGoal.mockReset();
    mockClientFns.getHyperscapeAgentQuickActions.mockReset();
    mockClientFns.createHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.controlHyperscapeEmbeddedAgent.mockReset();
    mockClientFns.sendHyperscapeAgentMessage.mockReset();
    mockClientFns.sendHyperscapeEmbeddedAgentCommand.mockReset();
    mockClientFns.getBabylonAgentStatus.mockReset();
    mockClientFns.getBabylonAgentSummary.mockReset();
    mockClientFns.getBabylonAgentGoals.mockReset();
    mockClientFns.getBabylonAgentRecentTrades.mockReset();
    mockClientFns.getBabylonPredictionMarkets.mockReset();
    mockClientFns.getBabylonTeamDashboard.mockReset();
    mockClientFns.getBabylonTeamConversations.mockReset();
    mockClientFns.getBabylonAgentChat.mockReset();
    mockClientFns.getBabylonAgentWallet.mockReset();
    mockClientFns.getBabylonAgentTradingBalance.mockReset();
    mockClientFns.controlAppRun.mockReset();
    mockClientFns.sendAppRunMessage.mockReset();
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
    mockClientFns.getBabylonAgentStatus.mockResolvedValue({
      name: "Babylon",
      displayName: "Babylon",
      agentStatus: "running",
      autonomous: true,
      autonomousTrading: true,
      autonomousPosting: false,
    });
    mockClientFns.getBabylonAgentSummary.mockResolvedValue({
      portfolio: {
        totalPnL: 12,
        positions: 1,
        totalAssets: 320,
        available: 120,
        wallet: 200,
        agents: 120,
        totalPoints: 4,
      },
    });
    mockClientFns.getBabylonAgentGoals.mockResolvedValue([]);
    mockClientFns.getBabylonAgentRecentTrades.mockResolvedValue({ items: [] });
    mockClientFns.getBabylonPredictionMarkets.mockResolvedValue({
      markets: [],
    });
    mockClientFns.getBabylonTeamDashboard.mockResolvedValue({
      agents: [],
      summary: null,
    });
    mockClientFns.getBabylonTeamConversations.mockResolvedValue({
      conversations: [],
    });
    mockClientFns.getBabylonAgentChat.mockResolvedValue({ messages: [] });
    mockClientFns.getBabylonAgentWallet.mockResolvedValue({
      balance: 0,
      transactions: [],
    });
    mockClientFns.getBabylonAgentTradingBalance.mockResolvedValue({
      balance: 0,
    });
    mockClientFns.controlAppRun.mockResolvedValue({
      success: true,
      message: "updated",
    });
    mockClientFns.sendAppRunMessage.mockResolvedValue({
      success: true,
      message: "sent",
    });
    mockGetInternalToolAppCatalogOrder
      .mockReset()
      .mockImplementation((name: string) =>
        name === "@miladyai/app-plugin-viewer" ? 0 : Number.MAX_SAFE_INTEGER,
      );
    mockGetInternalToolAppTargetTab
      .mockReset()
      .mockImplementation((name: string) =>
        name === "@miladyai/app-plugin-viewer" ? "plugins" : null,
      );
    mockInternalToolApps.mockReset().mockReturnValue([]);
    mockIsInternalToolApp
      .mockReset()
      .mockImplementation(
        (name: string) => name === "@miladyai/app-plugin-viewer",
      );
    mockClientFns.listInstalledApps.mockResolvedValue([]);
    mockClientFns.listAppRuns.mockResolvedValue([]);
    originalMatchMedia = window.matchMedia;
  });

  const tStub = (
    key: string,
    vars?: Record<string, string | number | boolean | null | undefined>,
  ) => {
    const name = typeof vars?.name === "string" ? vars.name : "App";
    const message =
      typeof vars?.message === "string" ? vars.message : "unknown error";
    const count = typeof vars?.count === "number" ? vars.count : 0;

    switch (key) {
      case "appsview.IframeAuthMissing":
        return `${name} requires iframe auth, but no auth payload was returned.`;
      case "appsview.OpenedInNewTab":
        return `${name} opened in a new tab.`;
      case "appsview.PopupBlockedOpen":
        return `Popup blocked while opening ${name}. Allow popups and try again.`;
      case "appsview.LaunchFailed":
        return `Failed to launch ${name}: ${message}`;
      case "appsview.Open":
        return `Open ${name}`;
      case "appsview.Search":
      case "appsview.SearchPlaceholder":
        return "Search apps";
      case "appsview.HelperText":
        return "Browse installed and available apps.";
      case "appsview.Results":
        return `${count} results`;
      case "appsview.NoAppsMatchSearch":
        return "No apps match your search.";
      case "appsview.NoAppsAvailable":
        return "No apps available.";
      case "appsview.NoRunningApps":
        return "No app runs are active right now.";
      case "appsview.NoRunningAppsHint":
        return "Launch a game from the catalog and it will appear here.";
      case "appsview.EmptySearchHint":
        return "Try a different search.";
      case "appsview.EmptyCatalogHint":
        return "Refresh the catalog.";
      case "appsview.GameRunning":
        return "Game running";
      case "appsview.Resume":
        return "Resume";
      case "appsview.LoadError":
        return `Failed to load apps: ${message}`;
      case "appsview.NetworkError":
        return "Network error";
      case "appsview.CurrentGameOpened":
        return "Current game opened in a new tab.";
      case "appsview.RunningNow":
        return "Running now";
      case "appsview.PopupBlocked":
        return "Popup blocked. Allow popups and try again.";
      case "appsview.LaunchedNoViewer":
        return `${name} launched without a viewer URL.`;
      case "appsview.EmptyStateTitle":
        return "Select an app to view details";
      case "appsview.EmptyStateDescription":
        return "Choose an app from the catalog.";
      case "common.error":
        return "Error";
      default:
        return key;
    }
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      delete (window as Window & { matchMedia?: typeof window.matchMedia })
        .matchMedia;
    }
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("shows only the curated Milady games in production", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@hyperscape/plugin-hyperscape", "Hyperscape", "Game", {
          category: "game",
        }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-2004scape", "2004scape", "Game", {
          category: "game",
        }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp(
          "@elizaos/app-defense-of-the-agents",
          "Defense of the Agents",
          "Game",
          {
            category: "game",
          },
        ),
        true,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("@elizaos/app-unlisted-game", "Unlisted Game", "Game", {
          category: "game",
        }),
        true,
      ),
    ).toBe(false);
  });

  it("keeps the same visibility rules in development", () => {
    expect(
      shouldShowAppInAppsView(
        createApp("@hyperscape/plugin-hyperscape", "Hyperscape", "Arena", {
          category: "game",
        }),
        false,
      ),
    ).toBe(true);
    expect(
      shouldShowAppInAppsView(
        createApp("@miladyai/app-plugin-viewer", "Plugin Viewer", "Tool app", {
          category: "utility",
        }),
        false,
      ),
    ).toBe(true);
  });

  it("launches the LifeOps app into its owned tab without a server round-trip", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    mockGetInternalToolAppCatalogOrder.mockImplementation((name: string) =>
      name === "@miladyai/app-lifeops" ? 0 : Number.MAX_SAFE_INTEGER,
    );
    mockGetInternalToolAppTargetTab.mockImplementation((name: string) =>
      name === "@miladyai/app-lifeops" ? "lifeops" : null,
    );
    mockIsInternalToolApp.mockImplementation(
      (name: string) => name === "@miladyai/app-lifeops",
    );
    mockInternalToolApps.mockReturnValue([
      createApp("@miladyai/app-lifeops", "LifeOps", "Tool app", {
        category: "utility",
        launchType: "local",
        launchUrl: null,
      }),
    ]);
    mockClientFns.listApps.mockResolvedValue([]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree.root, "LifeOps").props.onClick();
    });
    await flush();

    expect(ctx.setState).toHaveBeenCalledWith("tab", "lifeops");
    expect(mockClientFns.launchApp).not.toHaveBeenCalled();
  });

  it("launches Defense of the Agents directly from the catalog card", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
    mockClientFns.listApps.mockResolvedValue([
      createApp(
        "@elizaos/app-defense-of-the-agents",
        "Defense of the Agents",
        "Autonomous lane defense",
        {
          category: "game",
          uiExtension: {
            detailPanelId: "defense-agent-control",
          },
        },
      ),
    ]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({ displayName: "Defense of the Agents" }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<AppsView />);
    });
    await flush();

    await act(async () => {
      findButtonByTitle(
        tree.root,
        "Defense of the Agents",
      ).props.onClick();
    });
    await flush();

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(
      "@elizaos/app-defense-of-the-agents",
    );
  });

  it("loads apps and launches iframe viewer flow", async () => {
    const ctx = createAppsContext();
    const t = (k: string) => {
      if (k === "appsview.Active") return "Active";
      if (k === "appsview.Back") return "Back";
      if (k === "appsview.Open") return "Open Hyperscape";
      if (k === "appsview.Refresh") return "Refresh";
      if (k === "appsview.ActiveOnly") return "Active Only";
      if (k === "appsview.SaySomethingToSel")
        return "Say something to selected agent...";
      return k;
    };
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t,
    });
    const app = createApp(
      "@hyperscape/plugin-hyperscape",
      "Hyperscape",
      "Arena",
      {
        uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
      },
    );
    const run = createRunSummary({
      runId: "run-hyperscape",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "http://localhost:5175",
      viewer: {
        url: "http://localhost:5175",
        sandbox: "allow-scripts allow-same-origin",
        postMessageAuth: true,
        authMessage: { type: "HYPERSCAPE_AUTH", authToken: "token-1" },
      },
      session: {
        sessionId: "agent-123",
        appName: app.name,
        mode: "spectate-and-steer",
        status: "connecting",
        canSendCommands: true,
        controls: ["pause"],
        summary: "Connecting session...",
      },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: run.viewer,
        session: run.session,
        run,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const appCard = findButtonByTitle(tree.root, "Hyperscape");
    await act(async () => {
      appCard.props.onClick();
    });
    await flush();

    expect(ctx.setState).toHaveBeenCalledWith(
      "appRuns",
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-hyperscape",
          appName: app.name,
          displayName: app.displayName,
        }),
      ]),
    );
    expect(ctx.setState).toHaveBeenCalledWith(
      "activeGameRunId",
      "run-hyperscape",
    );
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "games");
    expect(
      ctx.setActionNotice.mock.calls.some((call) =>
        String(call[0]).includes("requires iframe auth"),
      ),
    ).toBe(false);
  });

  it("launches app directly when clicking a card on small screens", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 1023px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const app = createApp("@elizaos/app-2004scape", "2004scape", "Retro MMO", {
      category: "game",
      uiExtension: {
        detailPanelId: "2004scape-operator-dashboard",
      },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        run: createRunSummary({
          runId: "run-2004scape",
          appName: app.name,
          displayName: app.displayName!,
          pluginName: app.name,
          viewer: {
            url: "http://localhost:5175",
            sandbox: "allow-scripts allow-same-origin",
          },
        }),
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<AppsView />);
    });
    await flush();

    const appCard = findButtonByTitle(tree.root, "2004scape");

    await act(async () => {
      appCard.props.onClick();
    });
    await flush();

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
  });

  it("prefers a run that needs recovery when the running tab opens", async () => {
    const staleRun = createRunSummary({
      runId: "run-stale",
      appName: "@hyperscape/plugin-hyperscape",
      displayName: "Hyperscape",
      pluginName: "@hyperscape/plugin-hyperscape",
      status: "stale",
      summary: "Reconnect the viewer to continue observing.",
      viewerAttachment: "detached",
      health: {
        state: "degraded",
        message: "Reconnect the viewer to continue observing.",
      },
      session: {
        sessionId: "stale-session",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "disconnected",
        displayName: "Hyperscape",
        agentId: "agent-1",
        characterId: "character-1",
        followEntity: "entity-9",
        canSendCommands: false,
        controls: ["pause"],
        summary: "Reconnect the viewer to continue observing.",
      },
      lastHeartbeatAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
    });
    const healthyRun = createRunSummary({
      runId: "run-healthy",
      appName: "@elizaos/app-babylon",
      displayName: "Babylon",
      pluginName: "@elizaos/app-babylon",
      status: "running",
      summary: "Market watch active.",
      viewerAttachment: "attached",
      health: {
        state: "healthy",
        message: "Market watch active.",
      },
      session: {
        sessionId: "healthy-session",
        appName: "@elizaos/app-babylon",
        mode: "viewer",
        status: "running",
        displayName: "Babylon",
        canSendCommands: true,
        controls: [],
        summary: "Market watch active.",
      },
      updatedAt: "2026-04-06T00:00:00.000Z",
      lastHeartbeatAt: new Date().toISOString(),
    });
    const ctx = createAppsContext({
      appRuns: [healthyRun, staleRun],
      appsSubTab: "running",
    });
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    mockClientFns.listApps.mockResolvedValue([
      createApp("@hyperscape/plugin-hyperscape", "Hyperscape", "Arena"),
      createApp("@elizaos/app-babylon", "Babylon", "Market"),
    ]);
    mockClientFns.listAppRuns.mockResolvedValue([healthyRun, staleRun]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    expect(textOf(tree.root)).toContain("Needs attention");
    expect(textOf(tree.root)).toContain("Hyperscape");
    expect(textOf(tree.root)).toContain("Reattach viewer");
    expect(textOf(tree.root)).toContain("Viewer is detached");
    expect(textOf(tree.root)).toContain("Command bridge is unavailable");
  });

  it("shows auth warning when postMessage auth payload is missing", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp(
      "@hyperscape/plugin-hyperscape",
      "Hyperscape",
      "Arena",
      {
        uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
      },
    );
    const run = createRunSummary({
      runId: "run-auth-missing",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "http://localhost:5175",
      viewer: {
        url: "http://localhost:5175",
        sandbox: "allow-scripts allow-same-origin",
        postMessageAuth: true,
      },
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: run.viewer,
        run,
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree.root, "Hyperscape").props.onClick();
    });
    await flush();

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      expect.stringContaining("requires iframe auth"),
      "error",
      4800,
    );
    expect(ctx.setState).toHaveBeenCalledWith("activeGameRunId", run.runId);
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "games");
  });

  it("opens non-viewer launches in a new tab and keeps the run in the running list", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    const run = createRunSummary({
      runId: "run-babylon",
      appName: app.name,
      displayName: app.displayName,
      pluginName: app.name,
      launchUrl: "https://example.com/babylon",
      viewer: null,
      viewerAttachment: "unavailable",
      status: "running",
      summary: "Babylon run active.",
    });
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
        run,
      }),
    );

    const popupSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree.root, "Babylon").props.onClick();
    });
    await flush();

    expect(popupSpy).toHaveBeenCalledWith(
      "https://example.com/babylon",
      "_blank",
      "noopener,noreferrer",
    );
    expect(ctx.setState).toHaveBeenCalledWith(
      "appRuns",
      expect.arrayContaining([
        expect.objectContaining({
          runId: "run-babylon",
          appName: app.name,
        }),
      ]),
    );
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "running");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
  });

  it("reports popup-blocked errors and launch failures", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
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

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    // First click launches — popup blocked path
    await act(async () => {
      findButtonByTitle(tree.root, "Babylon").props.onClick();
    });
    await flush();

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );

    // Second click triggers network error
    await act(async () => {
      findButtonByTitle(tree.root, "Babylon").props.onClick();
    });
    await flush();

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Failed to launch Babylon: network down",
      "error",
      4000,
    );
  });

  it("uses the Electrobun shell bridge for external app launches", async () => {
    const ctx = createAppsContext();
    const request = vi.fn(async () => undefined);
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
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
    (
      window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: { desktopOpenExternal: request },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    const popupSpy = vi.spyOn(window, "open");

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree.root, "Babylon").props.onClick();
    });
    await flush();

    expect(request).toHaveBeenCalledWith({
      url: "https://example.com/babylon",
    });
    expect(popupSpy).not.toHaveBeenCalled();
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
    delete (window as Window & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    delete (
      globalThis as typeof globalThis & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__;
  });

  it("refreshes list and applies search filtering", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const appOne = createApp(
      "@hyperscape/plugin-hyperscape",
      "Hyperscape",
      "Arena",
    );
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);
    mockClientFns.listAppRuns.mockResolvedValue([
      createRunSummary({
        runId: "run-hyperscape",
        appName: appOne.name,
        displayName: appOne.displayName,
        pluginName: appOne.name,
      }),
    ]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const root = tree?.root;
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Babylon",
      ).length,
    ).toBe(1);
    const searchInput = root.findByType("input");
    await act(async () => {
      searchInput.props.onChange({ target: { value: "hyper" } });
    });
    expect(
      root.findAll(
        (node) =>
          node.type === "button" && node.props.title === "Hyperscape",
      ).length,
    ).toBe(1);
    expect(
      root.findAll(
        (node) => node.type === "button" && node.props.title === "Babylon",
      ).length,
    ).toBe(0);

    await act(async () => {
      await findButtonByText(root, "common.refresh").props.onClick();
    });
    expect(mockClientFns.listApps).toHaveBeenCalledTimes(2);
  });

  it("renders the browse catalog in named sections", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    mockGetInternalToolAppCatalogOrder.mockImplementation((name: string) =>
      name === "@miladyai/app-lifeops" ? 0 : Number.MAX_SAFE_INTEGER,
    );
    mockGetInternalToolAppTargetTab.mockImplementation((name: string) =>
      name === "@miladyai/app-lifeops" ? "lifeops" : null,
    );
    mockIsInternalToolApp.mockImplementation(
      (name: string) => name === "@miladyai/app-lifeops",
    );
    mockInternalToolApps.mockReturnValue([
      createApp("@miladyai/app-lifeops", "LifeOps", "Tasks and calendar", {
        category: "utility",
        launchType: "local",
        launchUrl: null,
      }),
    ]);
    mockClientFns.listApps.mockResolvedValue([
      createApp(
        "@hyperscape/plugin-hyperscape",
        "Hyperscape",
        "Arena world",
        {
          category: "game",
        },
      ),
      createApp("@elizaos/app-babylon", "Babylon", "Market watch", {
        category: "platform",
      }),
      createApp("@miladyai/app-companion", "Companion", "Chat with Milady", {
        category: "world",
      }),
    ]);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<AppsView />);
    });
    await flush();

    expect(textOf(tree.root)).toContain("Games");
    expect(textOf(tree.root)).toContain("Business");
    expect(textOf(tree.root)).toContain("Life Management");
    expect(textOf(tree.root)).toContain("Companions");
    expect(
      tree.root.findAll(
        (node) => node.props["data-testid"] === "apps-section-games",
      ).length,
    ).toBe(1);
    expect(
      tree.root.findAll(
        (node) => node.props["data-testid"] === "apps-section-lifeManagement",
      ).length,
    ).toBe(1);
  });

  it("launches Hyperscape directly without legacy API calls", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp(
      "@hyperscape/plugin-hyperscape",
      "Hyperscape",
      "Arena",
      {
        uiExtension: { detailPanelId: "hyperscape-embedded-agents" },
      },
    );
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({ displayName: app.displayName }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Hyperscape").props.onClick();
    });
    await flush();

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
    expect(mockClientFns.listHyperscapeEmbeddedAgents).not.toHaveBeenCalled();
  });

  it("launches app directly when clicking a card tile", async () => {
    const ctx = createAppsContext();
    mockUseApp.mockReturnValue({
      ...ctx,
      uiLanguage: "en",
      t: tStub,
    });
    const app = createApp(
      "@hyperscape/plugin-hyperscape",
      "Hyperscape",
      "Arena",
    );
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.listAppRuns.mockResolvedValue([
      createRunSummary({
        runId: "run-hyperscape",
        appName: app.name,
        displayName: app.displayName,
        pluginName: app.name,
      }),
    ]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        run: createRunSummary({
          runId: "run-hyperscape",
          appName: app.name,
          displayName: app.displayName!,
          pluginName: app.name,
        }),
      }),
    );

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      findButtonByTitle(tree?.root, "Hyperscape").props.onClick();
    });
    await flush();

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
  });
});
