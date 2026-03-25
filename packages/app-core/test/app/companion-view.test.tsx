// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textOf as text } from "../../../../test/helpers/react-test";

const mockUseApp = vi.fn();
const viewerPropsRef: { current: null | Record<string, unknown> } = {
  current: null,
};

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  getVrmBackgroundUrl: (index: number) =>
    `/vrms/backgrounds/milady-${index}.png`,
  getVrmTitle: (index: number) => `MILADY-${index}`,
  VRM_COUNT: 24,
  CUSTOM_ONBOARDING_STEPS: [],
  useCompanionSceneConfig: () => ({
    companionVrmPowerMode: "balanced",
    companionHalfFramerateMode: "when_saving_power",
    companionAnimateWhenHidden: false,
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("../../src/components/avatar/VrmViewer", () => ({
  VrmViewer: (props: Record<string, unknown>) => {
    viewerPropsRef.current = props;
    return React.createElement("div", null, "VrmViewer");
  },
}));

vi.mock("../../src/components/ChatModalView", () => ({
  ChatModalView: () =>
    React.createElement(
      "div",
      { "data-testid": "companion-chat-modal-stub" },
      "ChatModalView",
    ),
}));

vi.mock("../../src/components/PtyConsoleDrawer", () => ({
  PtyConsoleDrawer: () => React.createElement("div", null, "PtyConsoleDrawer"),
}));

vi.mock("../../src/components/PtyConsoleSidePanel", () => ({
  PtyConsoleSidePanel: () =>
    React.createElement("div", null, "PtyConsoleSidePanel"),
}));

const mockUploadCustomVrm = vi.fn(async () => {});
const mockUploadCustomBackground = vi.fn(async () => {});

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    uploadCustomVrm: (...args: unknown[]) => mockUploadCustomVrm(...args),
    uploadCustomBackground: (...args: unknown[]) =>
      mockUploadCustomBackground(...args),
    onWsEvent: vi.fn(() => () => {}),
  },
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveApiUrl: (p: string) => p,
  resolveAppAssetUrl: (p: string) => p,
  DESKTOP_WORKSPACE_SURFACES: [],
  modelLooksLikeElizaCloudHosted: () => false,
}));

import { CompanionSceneHost } from "../../src/components/CompanionSceneHost";
import { CompanionView } from "../../src/components/CompanionView";

const COMPANION_ZOOM_STORAGE_KEY = "milady.companion.zoom.v1";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    t: (k: string) => k,
    chatMode: "simple",
    chatAgentVoiceMuted: false,
    conversationMessages: [],
    chatLastUsage: null,
    elizaCloudAuthRejected: false,
    elizaCloudCreditsError: null,
    elizaCloudEnabled: false,
    elizaCloudConnected: false,
    setState: vi.fn(),
    handleStartDraftConversation: vi.fn(async () => {}),
    handleNewConversation: vi.fn(async () => {}),
    selectedVrmIndex: 1,
    customVrmUrl: "",
    customBackgroundUrl: "",
    walletAddresses: null,
    walletBalances: null,
    walletNfts: null,
    walletLoading: false,
    walletNftsLoading: false,
    walletError: null,
    ptySessions: [],
    ptySidePanelSessionId: null,
    setPtySidePanelSessionId: vi.fn(),
    loadBalances: vi.fn(async () => {}),
    loadNfts: vi.fn(async () => {}),
    getBscTradePreflight: vi.fn(async () => ({
      ok: false,
      reasons: ["disabled"],
    })),
    getBscTradeQuote: vi.fn(async () => ({
      route: [],
      quoteIn: { amount: "0", symbol: "BNB" },
      quoteOut: { amount: "0", symbol: "BNB" },
      minReceive: { amount: "0", symbol: "BNB" },
      slippageBps: 100,
    })),
    getBscTradeTxStatus: vi.fn(async (hash: string) => ({
      ok: true,
      hash,
      status: "pending",
      explorerUrl: `https://bscscan.com/tx/${hash}`,
      chainId: 56,
      blockNumber: null,
      confirmations: 0,
      nonce: null,
      gasUsed: null,
      effectiveGasPriceWei: null,
    })),
    loadWalletTradingProfile: vi.fn(async () => ({
      window: "30d",
      source: "all",
      generatedAt: new Date().toISOString(),
      summary: {
        totalSwaps: 0,
        buyCount: 0,
        sellCount: 0,
        settledCount: 0,
        successCount: 0,
        revertedCount: 0,
        tradeWinRate: null,
        txSuccessRate: null,
        winningTrades: 0,
        evaluatedTrades: 0,
        realizedPnlBnb: "0",
        volumeBnb: "0",
      },
      pnlSeries: [],
      tokenBreakdown: [],
      recentSwaps: [],
    })),
    executeBscTrade: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    executeBscTransfer: vi.fn(async () => ({
      executed: false,
      execution: null,
      requiresUserSignature: false,
    })),
    setActionNotice: vi.fn(),
    agentStatus: {
      state: "running",
      agentName: "Milady",
      platform: "test",
      pid: null,
    },
    elizaCloudCredits: null,
    elizaCloudCreditsCritical: false,
    elizaCloudCreditsLow: false,
    elizaCloudTopUpUrl: "",
    lifecycleBusy: false,
    lifecycleAction: null,

    handleRestart: vi.fn(async () => {}),
    copyToClipboard: vi.fn(async () => {}),
    uiLanguage: "en",
    setUiLanguage: vi.fn(),
    uiTheme: "light",
    setUiTheme: vi.fn(),
    uiShellMode: "companion",
    setUiShellMode: vi.fn(),
    switchUiShellMode: vi.fn(),
    switchShellView: vi.fn(),
    navigation: {
      subscribeTabCommitted: () => () => {},
      scheduleAfterTabCommit: (fn: () => void) => {
        queueMicrotask(fn);
      },
    },
    setTab: vi.fn(),
    plugins: [],
    ...overrides,
  };
}

function createCompanionRootMock(
  options: { hasPointerCapture?: boolean } = {},
) {
  const listeners = new Map<string, EventListener>();
  const node = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.set(type, listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (listeners.get(type) === listener) {
          listeners.delete(type);
        }
      },
    ),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => options.hasPointerCapture ?? true),
    clientWidth: 1440,
    clientHeight: 900,
  };

  return {
    node,
    getListener(type: string) {
      return listeners.get(type) as ((event: Event) => void) | undefined;
    },
  };
}

function renderWithCompanionRootMock(
  rootMock: ReturnType<typeof createCompanionRootMock>,
) {
  return TestRenderer.create(React.createElement(CompanionView), {
    createNodeMock: (element) =>
      element.props?.["data-testid"] === "companion-root"
        ? rootMock.node
        : null,
  });
}

describe("CompanionView", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    viewerPropsRef.current = null;
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => storage.get(String(key)) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(String(key), String(value));
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(String(key));
        }),
        clear: vi.fn(() => {
          storage.clear();
        }),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        innerHeight: 900,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    Object.assign(document, {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "activeElement");
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it("renders CompanionView containing VrmStage, Header, and HubNav", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const content = text(tree?.root);
    // Should render the mock VrmViewer text
    expect(content).toContain("VrmViewer");
    // ChatModalView is gated behind avatarReady (VRM teleport), so it won't
    // render until the avatar finishes loading. Verify the header overlay is
    // present instead (rendered with opacity 0 while waiting).
    const desktopVoice = tree?.root.findAllByProps({
      "data-testid": "companion-header-desktop-voice",
    });
    const desktopNewChat = tree?.root.findAllByProps({
      "data-testid": "companion-header-desktop-new-chat",
    });
    expect(desktopVoice.length).toBeGreaterThanOrEqual(1);
    expect(desktopNewChat.length).toBeGreaterThanOrEqual(1);
    const headerShell = tree?.root.findAllByProps({
      "data-testid": "companion-header-shell",
    });
    expect(headerShell).toHaveLength(1);
  });

  it("reveals the companion overlay if teleport completion never arrives", async () => {
    vi.useFakeTimers();
    window.setTimeout = globalThis.setTimeout.bind(globalThis);
    window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = TestRenderer.create(React.createElement(CompanionView));
      });

      expect(
        tree?.root.findAllByProps({
          "data-testid": "companion-chat-modal-stub",
        }),
      ).toHaveLength(0);

      await act(async () => {
        vi.advanceTimersByTime(1400);
      });

      expect(
        tree?.root.findAllByProps({
          "data-testid": "companion-chat-modal-stub",
        }),
      ).toHaveLength(1);
    } finally {
      await act(async () => {
        tree?.unmount();
      });
      vi.useRealTimers();
      window.setTimeout = globalThis.setTimeout.bind(globalThis);
      window.clearTimeout = globalThis.clearTimeout.bind(globalThis);
    }
  });

  it("renders split companion header actions around the shell chrome", async () => {
    const setState = vi.fn();
    const handleStartDraftConversation = vi.fn(async () => {});
    const handleNewConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        setState,
        handleStartDraftConversation,
        handleNewConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const desktopVoice = tree?.root.findByProps({
      "data-testid": "companion-header-desktop-voice",
    });
    const desktopNewChat = tree?.root.findByProps({
      "data-testid": "companion-header-desktop-new-chat",
    });
    const headerShell = tree?.root.findByProps({
      "data-testid": "companion-header-shell",
    });
    const voiceButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "companion.agentVoiceOn",
    );
    const newChatButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "companion.newChat",
    );

    expect(String(headerShell.props.className)).toContain("max-w-5xl");
    expect(String(desktopVoice.props.className)).toContain("shrink-0");
    expect(String(desktopNewChat.props.className)).toContain("shrink-0");
    expect(voiceButton).toBeDefined();
    expect(newChatButton).toBeDefined();
    expect(String(newChatButton.props.className)).toContain("backdrop-blur-xl");

    await act(async () => {
      voiceButton?.props.onClick();
    });
    expect(setState).toHaveBeenCalledWith("chatAgentVoiceMuted", true);

    await act(async () => {
      newChatButton?.props.onClick();
    });
    expect(handleNewConversation).toHaveBeenCalledTimes(1);
  });

  it("shows the cloud badge in companion mode only when connected", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudConnected: true,
        elizaCloudCredits: 87.5,
      }),
    );

    let connectedTree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      connectedTree = TestRenderer.create(React.createElement(CompanionView));
    });
    if (!connectedTree) {
      throw new Error("Failed to render connected CompanionView");
    }

    const connectedBadge = connectedTree.root.findByProps({
      "data-testid": "companion-cloud-status",
    });
    expect(connectedBadge.props["data-status"]).toBe("regular-credits");
    expect(String(connectedBadge.props.className)).toContain("backdrop-blur-xl");
    expect(String(connectedBadge.props.className)).toContain("font-medium");
    expect(String(connectedBadge.props.className)).not.toContain("font-mono");
    expect(connectedBadge.props.style.backgroundColor).toBeUndefined();
    expect(connectedBadge.props.style.borderColor).toBe("transparent");
    expect(text(connectedBadge)).toContain("$87.5");

    mockUseApp.mockReturnValue(createContext());

    let disconnectedTree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      disconnectedTree = TestRenderer.create(
        React.createElement(CompanionView),
      );
    });
    if (!disconnectedTree) {
      throw new Error("Failed to render disconnected CompanionView");
    }

    expect(
      disconnectedTree.root.findAllByProps({
        "data-testid": "companion-cloud-status",
      }),
    ).toHaveLength(0);
  });

  it("opens billing from the companion cloud badge", async () => {
    const setState = vi.fn();
    const setTab = vi.fn();
    const switchShellView = vi.fn();

    mockUseApp.mockReturnValue(
      createContext({
        elizaCloudConnected: true,
        elizaCloudCredits: 87.5,
        setState,
        setTab,
        switchShellView,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });
    if (!tree) {
      throw new Error("Failed to render CompanionView");
    }

    const cloudBadge = tree.root.findByProps({
      "data-testid": "companion-cloud-status",
    });

    await act(async () => {
      cloudBadge.props.onClick();
      await Promise.resolve();
    });

    expect(switchShellView).toHaveBeenCalledWith("desktop");
    expect(setState).toHaveBeenCalledWith("cloudDashboardView", "billing");
    expect(setTab).toHaveBeenCalledWith("settings");
  });

  it("keeps the shared companion scene wrapper height-bounded", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          CompanionSceneHost,
          { active: false },
          React.createElement("div", null, "Child"),
        ),
      );
    });

    const root = tree?.root.findByProps({ "data-testid": "companion-root" });
    expect(String(root?.props.className)).toContain("h-full");
    expect(String(root?.props.className)).toContain("min-h-0");
    expect(String(root?.props.className)).toContain("flex");
    expect(String(root?.props.className)).toContain("overflow-hidden");
  });

  it("pins companion mode to fast and hides the fast/pro toggle", async () => {
    const context = createContext();
    mockUseApp.mockReturnValue(context);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    expect(
      tree?.root.findAllByProps({
        "data-testid": "chat-mode-toggle-companion",
      }),
    ).toHaveLength(0);
    expect(context.setState).toHaveBeenCalledWith("chatMode", "simple");
  });

  it("orbits the companion camera from transcript drag and resets on release", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setDragOrbitTarget = vi.fn();
    const resetDragOrbit = vi.fn();
    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget,
        resetDragOrbit,
        setCompanionZoomNormalized,
      });
    });

    expect(setCompanionZoomNormalized).toHaveBeenCalledWith(0.95);
    setDragOrbitTarget.mockClear();
    resetDragOrbit.mockClear();

    expect(tree).not.toBeNull();
    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      clientWidth: 1440,
      clientHeight: 900,
    };
    const preventDefault = vi.fn();

    await act(async () => {
      root?.props.onPointerDownCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
        clientX: 200,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault,
      });
      root?.props.onPointerMoveCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
        clientX: 560,
        clientY: 120,
        preventDefault,
      });
      root?.props.onPointerUpCapture({
        target: document.createElement("div"),
        currentTarget,
        pointerId: 7,
      });
    });

    expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(7);
    expect(setDragOrbitTarget).toHaveBeenCalledTimes(1);
    const [yaw, pitch] = setDragOrbitTarget.mock.calls[0];
    expect(yaw).toBeCloseTo(0.3375);
    expect(pitch).toBeCloseTo(0.17);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(resetDragOrbit).toHaveBeenCalledTimes(1);
    expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("ignores drag capture inside marked no-camera-drag controls", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setDragOrbitTarget = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget,
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized: vi.fn(),
      });
    });
    setDragOrbitTarget.mockClear();

    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      clientWidth: 1440,
      clientHeight: 900,
    };
    const composerControl = document.createElement("div");
    composerControl.setAttribute("data-no-camera-drag", "true");

    await act(async () => {
      root?.props.onPointerDownCapture({
        target: composerControl,
        currentTarget,
        pointerId: 7,
        clientX: 200,
        clientY: 300,
      });
      root?.props.onPointerMoveCapture({
        target: composerControl,
        currentTarget,
        pointerId: 7,
        clientX: 560,
        clientY: 120,
        preventDefault: vi.fn(),
      });
    });

    expect(currentTarget.setPointerCapture).not.toHaveBeenCalled();
    expect(setDragOrbitTarget).not.toHaveBeenCalled();
  });

  it("zooms the companion camera from root wheel input, including over overlay UI", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        deltaY: 120,
        deltaMode: 0,
        preventDefault,
        target: document.createElement("div"),
        ctrlKey: false,
      } as WheelEvent);
    });

    const lastZoom =
      setCompanionZoomNormalized.mock.calls.at(-1)?.[0] ?? Number.NaN;
    expect(lastZoom).toBeCloseTo(0.95 - 120 / 720, 5);
    expect(localStorage.setItem).toHaveBeenLastCalledWith(
      COMPANION_ZOOM_STORAGE_KEY,
      String(lastZoom),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not zoom the companion camera while a text entry is focused", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const focusedTextEntry = document.createElement("textarea");
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: focusedTextEntry,
    });
    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        ctrlKey: true,
        deltaY: -90,
        deltaMode: 0,
        preventDefault,
        target: document.createElement("div"),
      } as WheelEvent);
    });

    expect(setCompanionZoomNormalized).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not zoom the companion camera while the transcript handles wheel scroll", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    await act(async () => {
      renderWithCompanionRootMock(rootMock);
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });
    setCompanionZoomNormalized.mockClear();

    const transcript = document.createElement("div");
    transcript.setAttribute("data-no-camera-zoom", "true");
    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    await act(async () => {
      wheelListener?.({
        target: transcript,
        deltaY: 120,
        deltaMode: 0,
        preventDefault,
        ctrlKey: false,
      } as WheelEvent);
    });

    expect(setCompanionZoomNormalized).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("zooms the companion camera from pinch input", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setCompanionZoomNormalized = vi.fn();
    const resetDragOrbit = vi.fn();
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      clientWidth: 1440,
      clientHeight: 900,
    };

    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit,
        setCompanionZoomNormalized,
      });
    });

    const root = tree?.root.findByProps({
      "data-testid": "companion-root",
    });

    await act(async () => {
      root?.props.onPointerDownCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 11,
        clientX: 200,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      root?.props.onPointerDownCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 12,
        clientX: 320,
        clientY: 300,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      });
      root?.props.onPointerMoveCapture({
        currentTarget,
        pointerType: "touch",
        pointerId: 12,
        clientX: 260,
        clientY: 300,
        preventDefault: vi.fn(),
      });
    });

    const zoomCalls = setCompanionZoomNormalized.mock.calls
      .map(([value]: [number]) => value)
      .filter((value) => value < 1);
    expect(resetDragOrbit).toHaveBeenCalledTimes(1);
    expect(zoomCalls.at(-1)).toBeLessThan(0.9);
  });

  it("restores persisted companion zoom on mount", async () => {
    localStorage.setItem(COMPANION_ZOOM_STORAGE_KEY, "0.62");
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CompanionView));
    });

    const setCompanionZoomNormalized = vi.fn();
    await act(async () => {
      const ready = viewerPropsRef.current?.onEngineReady as
        | ((value: unknown) => void)
        | undefined;
      ready?.({
        setPaused: vi.fn(),
        setCameraAnimation: vi.fn(),
        setPointerParallaxEnabled: vi.fn(),
        setDragOrbitTarget: vi.fn(),
        resetDragOrbit: vi.fn(),
        setCompanionZoomNormalized,
      });
    });

    expect(tree).not.toBeNull();
    expect(setCompanionZoomNormalized).toHaveBeenCalledWith(0.62);
  });

  it("uses the companion root as the interactive drag surface for camera orbit", async () => {
    mockUseApp.mockReturnValue(createContext());
    const rootMock = createCompanionRootMock();

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = renderWithCompanionRootMock(rootMock);
    });

    const dragLayer = tree?.root.findByProps({
      "data-testid": "companion-root",
    });

    expect(dragLayer?.props.className).toContain("cursor-grab");
    expect(dragLayer?.props.style).toMatchObject({
      touchAction: "none",
      overscrollBehavior: "none",
    });
    expect(typeof dragLayer?.props.onPointerDownCapture).toBe("function");
    expect(rootMock.node.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { capture: true, passive: false },
    );
  });
});
