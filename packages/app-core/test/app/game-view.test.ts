// @vitest-environment jsdom

import type {
  AppRunSummary,
  AppSessionState,
  AppViewerAuthMessage,
} from "@miladyai/app-core/api";
import * as electrobunRpc from "@miladyai/app-core/bridge/electrobun-rpc";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findButtonByText,
  flush,
  textOf,
} from "../../../../test/helpers/react-test";

interface GameContextStub {
  t: (key: string, opts?: Record<string, unknown>) => string;
  appRuns: AppRunSummary[];
  activeGameRunId: string;
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: AppViewerAuthMessage | null;
  activeGameSession: AppSessionState | null;
  gameOverlayEnabled: boolean;
  plugins: { id: string; enabled: boolean }[];
  logs: unknown[];
  loadLogs: () => Promise<void>;
  setState: (key: string, value: unknown) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

type TestWindow = Window & {
  __electrobunWindowId?: number;
};

let originalMatchMedia: typeof window.matchMedia | undefined;

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    getCodingAgentStatus: vi.fn(async () => null),
    getAppRun: vi.fn(async () => null),
    getAppSessionState: vi.fn(async () => null),
    sendAppRunMessage: vi.fn(),
    sendAppSessionMessage: vi.fn(),
    controlAppRun: vi.fn(),
    controlAppSession: vi.fn(),
    sendChatRest: vi.fn(),
    stopAppRun: vi.fn(),
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
  },
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClientFns,
}));
vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { GameView } from "../../src/components/apps/GameView";

function createRunSummary(
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@elizaos/app-2004scape",
    displayName: "2004scape",
    pluginName: "@elizaos/app-2004scape",
    launchType: "connect",
    launchUrl: "http://localhost:5175/viewer",
    viewer: {
      url: "http://localhost:5175/viewer",
      sandbox: "allow-scripts allow-same-origin",
      postMessageAuth: false,
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

function createContext(overrides?: Partial<GameContextStub>): GameContextStub {
  const run = createRunSummary({
    viewer:
      overrides?.activeGameViewerUrl === ""
        ? null
        : {
            url:
              overrides?.activeGameViewerUrl ?? "http://localhost:5175/viewer",
            sandbox:
              overrides?.activeGameSandbox ?? "allow-scripts allow-same-origin",
            postMessageAuth: overrides?.activeGamePostMessageAuth ?? false,
            authMessage: overrides?.activeGamePostMessagePayload ?? undefined,
          },
    session: overrides?.activeGameSession ?? null,
  });
  return {
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.defaultValue && typeof opts.defaultValue === "string") {
        let str = opts.defaultValue;
        for (const [key, val] of Object.entries(opts)) {
          if (key !== "defaultValue")
            str = str.replace(`{{${key}}}`, String(val));
        }
        return str;
      }
      return k;
    },
    appRuns: [run],
    activeGameRunId: run.runId,
    activeGameApp: "@elizaos/app-2004scape",
    activeGameDisplayName: "2004scape",
    activeGameViewerUrl: "http://localhost:5175/viewer",
    activeGameSandbox: "allow-scripts allow-same-origin",
    activeGamePostMessageAuth: false,
    activeGamePostMessagePayload: null,
    activeGameSession: null,
    gameOverlayEnabled: false,
    plugins: [],
    logs: [],
    loadLogs: vi.fn(async () => {}),
    setState: vi.fn<GameContextStub["setState"]>(),
    setActionNotice: vi.fn<GameContextStub["setActionNotice"]>(),
    ...overrides,
  };
}

describe("GameView", () => {
  beforeEach(() => {
    delete (window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.spyOn(electrobunRpc, "getElectrobunRendererRpc").mockReturnValue(
      undefined,
    );
    mockClientFns.stopAppRun.mockReset();
    mockClientFns.getAppRun.mockReset();
    mockClientFns.getAppSessionState.mockReset();
    mockClientFns.sendAppRunMessage.mockReset();
    mockClientFns.sendAppSessionMessage.mockReset();
    mockClientFns.controlAppRun.mockReset();
    mockClientFns.controlAppSession.mockReset();
    mockClientFns.sendChatRest.mockReset();
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
    mockUseApp.mockReset();
    originalMatchMedia = window.matchMedia;

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
        totalPnL: 25,
        positions: 2,
        totalAssets: 1200,
        available: 200,
        wallet: 500,
        agents: 500,
        totalPoints: 10,
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      // biome-ignore lint/performance/noDelete: test cleanup for mutable global
      delete (window as Window & { matchMedia?: typeof window.matchMedia })
        .matchMedia;
    }
    delete (window as TestWindow).__electrobunWindowId;
    delete (window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown })
      .__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("renders empty state and Back to Apps returns to apps tab", async () => {
    const ctx = createContext({
      appRuns: [],
      activeGameRunId: "",
      activeGameApp: "",
      activeGameDisplayName: "",
      activeGameViewerUrl: "",
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree?.root, "game.backToApps").props.onClick();
    });

    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
  });

  it("opens viewer in a new tab and handles popup blocking", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });

    expect(openSpy).toHaveBeenCalledWith(
      ctx.activeGameViewerUrl,
      "_blank",
      "noopener,noreferrer",
    );
    expect(ctx.setActionNotice).not.toHaveBeenCalledWith(
      "Popup blocked. Allow popups and try again.",
      "error",
      3600,
    );

    openSpy.mockReturnValueOnce(null);
    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });
    expect(ctx.setActionNotice).not.toHaveBeenCalledWith(
      "Popup blocked. Allow popups and try again.",
      "error",
      3600,
    );
  });

  it("uses the Electrobun shell bridge when opening the viewer externally", async () => {
    const ctx = createContext();
    const desktopOpenExternal = vi.fn(async () => undefined);
    const gameOpenWindow = vi.fn(async () => ({ id: "game-window-1" }));
    mockUseApp.mockReturnValue(ctx);
    (window as TestWindow).__electrobunWindowId = 1;

    (
      window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        desktopOpenExternal,
        gameOpenWindow,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    const openSpy = vi.spyOn(window, "open");

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.openInNewTab").props.onClick();
    });

    expect(gameOpenWindow).toHaveBeenCalledWith({
      url: ctx.activeGameViewerUrl,
      title: ctx.activeGameDisplayName || ctx.activeGameApp,
    });
    expect(desktopOpenExternal).toHaveBeenCalledWith({
      url: ctx.activeGameViewerUrl,
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("keeps auth-backed embedded viewers inside the app shell on Electrobun", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-embedded",
      agentId: "agent-1",
      characterId: "char-1",
      followEntity: "char-1",
    };
    const ctx = createContext({
      activeGameApp: "@hyperscape/plugin-hyperscape",
      activeGameDisplayName: "Hyperscape",
      activeGameViewerUrl:
        "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control",
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
      appRuns: [
        createRunSummary({
          appName: "@hyperscape/plugin-hyperscape",
          displayName: "Hyperscape",
          viewer: {
            url: "http://localhost:3333?embedded=true&mode=spectator&surface=agent-control",
            embedParams: {
              embedded: "true",
              mode: "spectator",
              surface: "agent-control",
            },
            sandbox: "allow-scripts allow-same-origin",
            postMessageAuth: true,
            authMessage: payload,
          },
        }),
      ],
    });
    const gameOpenWindow = vi.fn(async () => ({ id: "game-window-1" }));
    mockUseApp.mockReturnValue(ctx);
    (window as TestWindow).__electrobunWindowId = 1;

    (
      window as TestWindow & { __MILADY_ELECTROBUN_RPC__?: unknown }
    ).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        gameOpenWindow,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    expect(gameOpenWindow).not.toHaveBeenCalled();
    expect(
      tree.root.find(
        (node) => node.props?.["data-testid"] === "game-view-iframe",
      ),
    ).toBeDefined();
  });

  it("stops app, resets state, and navigates back on success", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockResolvedValue({
      success: true,
      appName: ctx.activeGameApp,
      runId: ctx.activeGameRunId,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: "2004scape stopped.",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });

    expect(mockClientFns.stopAppRun).toHaveBeenCalledWith(ctx.activeGameRunId);
    expect(ctx.setState).toHaveBeenCalledWith("appRuns", []);
    expect(ctx.setState).toHaveBeenCalledWith("activeGameRunId", "");
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "browse");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "2004scape stopped.",
      "success",
      3200,
    );
  });

  it("shows stop errors when API call fails", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockRejectedValue(new Error("stop failed"));

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Failed to stop: stop failed",
      "error",
    );
  });

  it("shows info notice when stop result is a no-op", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.stopAppRun.mockResolvedValue({
      success: false,
      appName: ctx.activeGameApp,
      runId: ctx.activeGameRunId,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "no-op",
      message: "No active session or installed plugin found.",
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree?.root, "game.stop").props.onClick();
    });
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "No active session or installed plugin found.",
      "info",
      3200,
    );
  });

  it("postMessage auth handshake sends auth once for matching origin", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-abc",
    };
    const ctx = createContext({
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
    });
    mockUseApp.mockReturnValue(ctx);

    let messageHandler:
      | ((event: MessageEvent<{ type?: string }>) => void)
      | null = null;
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "message" && typeof listener === "function") {
        messageHandler = listener as (
          event: MessageEvent<{ type?: string }>,
        ) => void;
      }
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (() => {}) as typeof window.removeEventListener,
    );

    const postMessage =
      vi.fn<(message: AppViewerAuthMessage, targetOrigin: string) => void>();
    Object.defineProperty(window, "postMessage", {
      value: postMessage,
      writable: true,
      configurable: true,
    });
    let _tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      _tree = TestRenderer.create(React.createElement(GameView), {
        createNodeMock: (element) => {
          if (element.type === "iframe") {
            return { contentWindow: window };
          }
          return {};
        },
      });
    });
    await flush();

    expect(messageHandler).toBeTypeOf("function");
    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://localhost:5175",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).toHaveBeenCalledWith(payload, "http://localhost:5175");
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Viewer auth sent.",
      "info",
      1800,
    );

    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://localhost:5175",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send auth when ready event origin mismatches", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-abc",
    };
    const ctx = createContext({
      activeGamePostMessageAuth: true,
      activeGamePostMessagePayload: payload,
    });
    mockUseApp.mockReturnValue(ctx);

    let messageHandler:
      | ((event: MessageEvent<{ type?: string }>) => void)
      | null = null;
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "message" && typeof listener === "function") {
        messageHandler = listener as (
          event: MessageEvent<{ type?: string }>,
        ) => void;
      }
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (() => {}) as typeof window.removeEventListener,
    );

    const postMessage =
      vi.fn<(message: AppViewerAuthMessage, targetOrigin: string) => void>();
    Object.defineProperty(window, "postMessage", {
      value: postMessage,
      writable: true,
      configurable: true,
    });
    let _tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      _tree = TestRenderer.create(React.createElement(GameView), {
        createNodeMock: (element) => {
          if (element.type === "iframe") {
            return { contentWindow: window };
          }
          return {};
        },
      });
    });
    await flush();

    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://evil.example",
      } as MessageEvent<{ type?: string }>);
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("Back to Apps button switches tab", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      findButtonByText(tree?.root, "game.backToApps").props.onClick();
    });
    expect(ctx.setState).toHaveBeenCalledWith("tab", "apps");
  });

  it("uses run-scoped messaging when a live run is active and shows queued acknowledgements", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-sandbox",
      activeGameDisplayName: "Sandbox",
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-sandbox",
          displayName: "Sandbox",
        }),
      ],
      activeGameSession: {
        sessionId: "agent-1",
        appName: "@elizaos/app-sandbox",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        controls: ["pause"],
        summary: "running: Chop wood",
      },
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.getAppSessionState.mockResolvedValue(ctx.activeGameSession);
    mockClientFns.sendAppRunMessage.mockResolvedValue({
      success: true,
      message: "Queued guidance for Hyperscape.",
      disposition: "queued",
      status: 202,
      run: {
        ...ctx.appRuns[0],
        session: ctx.activeGameSession,
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    const input = tree.root.findAll(
      (node) => node.props?.placeholder === "game.chatPlaceholder",
    )[0];
    expect(input).toBeDefined();
    await act(async () => {
      input.props.onChange({ target: { value: "go chop some wood" } });
    });

    await act(async () => {
      await findButtonByText(tree.root, "common.send").props.onClick();
    });

    expect(mockClientFns.sendAppRunMessage).toHaveBeenCalledWith(
      ctx.activeGameRunId,
      "go chop some wood",
    );
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Queued guidance for Hyperscape.",
      "info",
      2600,
    );
  });

  it("shows run control acknowledgements for session-backed apps", async () => {
    const ctx = createContext({
      activeGameApp: "@hyperscape/plugin-hyperscape",
      activeGameSession: {
        sessionId: "agent-2",
        appName: "@hyperscape/plugin-hyperscape",
        mode: "spectate-and-steer",
        status: "running",
        canSendCommands: true,
        controls: ["pause"],
        summary: "running: Patrolling",
      },
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.getAppSessionState.mockResolvedValue(ctx.activeGameSession);
    mockClientFns.controlAppRun.mockResolvedValue({
      success: true,
      message: "Hyperscape run paused.",
      disposition: "accepted",
      status: 200,
      run: {
        ...ctx.appRuns[0],
        session: {
          ...ctx.activeGameSession,
          status: "paused",
          controls: ["resume"],
        },
      },
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree.root, "Pause").props.onClick();
    });

    expect(mockClientFns.controlAppRun).toHaveBeenCalledWith(
      ctx.activeGameRunId,
      "pause",
    );
    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "Hyperscape run paused.",
      "success",
      2400,
    );
  });

  it("shows rejected notices when run steering is rejected", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-sandbox",
      activeGameDisplayName: "Sandbox",
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-sandbox",
          displayName: "Sandbox",
        }),
      ],
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.sendAppRunMessage.mockResolvedValue({
      success: false,
      message: "The run rejected that instruction.",
      disposition: "rejected",
      status: 409,
      run: ctx.appRuns[0],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    const input = tree.root.findAll(
      (node) => node.props?.placeholder === "game.chatPlaceholder",
    )[0];
    await act(async () => {
      input.props.onChange({ target: { value: "do the wrong thing" } });
    });

    await act(async () => {
      await findButtonByText(tree.root, "common.send").props.onClick();
    });

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "The run rejected that instruction.",
      "error",
      3200,
    );
  });

  it("shows unsupported notices when run steering is unavailable", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-sandbox",
      activeGameDisplayName: "Sandbox",
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-sandbox",
          displayName: "Sandbox",
        }),
      ],
    });
    mockUseApp.mockReturnValue(ctx);
    mockClientFns.sendAppRunMessage.mockResolvedValue({
      success: false,
      message: "This run does not expose a steering channel yet.",
      disposition: "unsupported",
      status: 501,
      run: ctx.appRuns[0],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    const input = tree.root.findAll(
      (node) => node.props?.placeholder === "game.chatPlaceholder",
    )[0];
    await act(async () => {
      input.props.onChange({ target: { value: "please steer" } });
    });

    await act(async () => {
      await findButtonByText(tree.root, "common.send").props.onClick();
    });

    expect(ctx.setActionNotice).toHaveBeenCalledWith(
      "This run does not expose a steering channel yet.",
      "error",
      3200,
    );
  });

  it("switches between game and dashboard on compact layouts", async () => {
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

    const ctx = createContext({
      activeGameSession: {
        sessionId: "session-2004scape",
        appName: "@elizaos/app-2004scape",
        mode: "spectate-and-steer",
        status: "running",
        displayName: "2004scape",
        canSendCommands: true,
        controls: ["pause"],
        summary: "Bot active",
      },
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    const dashboardSurfaceToggles = tree?.root.findAll(
      (node) => node.props["data-testid"] === "game-mobile-surface-dashboard",
    );
    expect(dashboardSurfaceToggles.length).toBeGreaterThan(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "game-view-iframe",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      tree?.root.findAll(
        (node) =>
          node.props["data-testid"] === "2004scape-live-operator-surface",
      ).length,
    ).toBe(0);

    await act(async () => {
      dashboardSurfaceToggles.at(-1)?.props.onClick();
    });
    await flush();

    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "game-view-iframe",
      ).length,
    ).toBe(0);
    expect(
      tree?.root.findAll(
        (node) =>
          node.props["data-testid"] === "2004scape-live-operator-surface",
      ).length,
    ).toBe(1);
  });

  it("does not render a duplicate dashboard toggle for Hyperscape", async () => {
    const ctx = createContext({
      activeGameApp: "@hyperscape/plugin-hyperscape",
      activeGameDisplayName: "Hyperscape",
      appRuns: [
        createRunSummary({
          appName: "@hyperscape/plugin-hyperscape",
          displayName: "Hyperscape",
        }),
      ],
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "game-toggle-logs",
      ).length,
    ).toBe(0);
    expect(
      tree?.root.findAll(
        (node) => node.props["data-testid"] === "game-mobile-surface-dashboard",
      ).length,
    ).toBe(0);
    expect(
      tree?.root.findAll(
        (node) =>
          node.props["data-testid"] === "game-view-iframe",
      ).length,
    ).toBe(1);
  });

  it("renders the Babylon live operator surface in the dashboard pane", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-babylon",
      activeGameDisplayName: "Babylon",
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-babylon",
          displayName: "Babylon",
        }),
      ],
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    expect(
      tree?.root.findAll(
        (node) =>
          node.props["data-testid"] === "babylon-live-operator-surface",
      ).length,
    ).toBe(1);
    expect(textOf(tree?.root)).toContain("Babylon Live Dashboard");
  });

  it("renders the Defense live operator surface in the dashboard pane", async () => {
    const ctx = createContext({
      activeGameApp: "@elizaos/app-defense-of-the-agents",
      activeGameDisplayName: "Defense of the Agents",
      appRuns: [
        createRunSummary({
          appName: "@elizaos/app-defense-of-the-agents",
          displayName: "Defense of the Agents",
          session: {
            sessionId: "defense-session",
            appName: "@elizaos/app-defense-of-the-agents",
            mode: "spectate-and-steer",
            status: "running",
            displayName: "Defense of the Agents",
            canSendCommands: true,
            controls: [],
            summary: "Holding mid lane while autoplay farms safely.",
            suggestedPrompts: ["tell the hero to rotate bot"],
            telemetry: {
              heroClass: "Ranger",
              heroLane: "mid",
              heroLevel: 12,
              heroHp: 73,
              heroMaxHp: 100,
              autoPlay: true,
              strategyVersion: 3,
              recentActivity: [
                {
                  ts: 1_712_345_678_000,
                  action: "rotate",
                  detail: "Moved from top lane to defend mid.",
                },
              ],
            },
          },
        }),
      ],
      activeGameSession: {
        sessionId: "defense-session",
        appName: "@elizaos/app-defense-of-the-agents",
        mode: "spectate-and-steer",
        status: "running",
        displayName: "Defense of the Agents",
        canSendCommands: true,
        controls: [],
        summary: "Holding mid lane while autoplay farms safely.",
        suggestedPrompts: ["tell the hero to rotate bot"],
        telemetry: {
          heroClass: "Ranger",
          heroLane: "mid",
          heroLevel: 12,
          heroHp: 73,
          heroMaxHp: 100,
          autoPlay: true,
          strategyVersion: 3,
          recentActivity: [
            {
              ts: 1_712_345_678_000,
              action: "rotate",
              detail: "Moved from top lane to defend mid.",
            },
          ],
        },
      },
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameView));
    });
    await flush();

    expect(
      tree?.root.findAll(
        (node) =>
          node.props["data-testid"] === "defense-live-operator-surface",
      ).length,
    ).toBe(1);
    expect(textOf(tree?.root)).toContain("Defense Live Dashboard");
    expect(textOf(tree?.root)).toContain("tell the hero to rotate bot");
  });
});
