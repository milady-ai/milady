// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  subscribeDesktopBridgeEventMock,
  keyboardSetScrollMock,
  useAppMock,
  useBugReportStateMock,
  useContextMenuMock,
  useStreamPopoutNavigationMock,
} = vi.hoisted(() => ({
  subscribeDesktopBridgeEventMock: vi.fn(() => vi.fn()),
  keyboardSetScrollMock: vi.fn(() => Promise.resolve()),
  useAppMock: vi.fn(),
  useBugReportStateMock: vi.fn(),
  useContextMenuMock: vi.fn(),
  useStreamPopoutNavigationMock: vi.fn(),
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    setScroll: keyboardSetScrollMock,
  },
}));

vi.mock("@miladyai/app-core/platform", () => ({
  isIOS: false,
  isNative: false,
}));

vi.mock("@miladyai/app-core/bridge", () => ({
  subscribeDesktopBridgeEvent: subscribeDesktopBridgeEventMock,
}));

vi.mock("./state", () => ({
  useApp: useAppMock,
}));

vi.mock("./hooks", () => ({
  BugReportProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useBugReportState: useBugReportStateMock,
  useContextMenu: useContextMenuMock,
  useStreamPopoutNavigation: useStreamPopoutNavigationMock,
}));

vi.mock("./app-shell-components", () => {
  const stub =
    (name: string) =>
    ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": name }, children);
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    AdvancedPageView: stub("AdvancedPageView"),
    AppsPageView: stub("AppsPageView"),
    AvatarLoader: stub("AvatarLoader"),
    BugReportModal: stub("BugReportModal"),
    CharacterEditor: stub("CharacterEditor"),
    ChatView: stub("ChatView"),
    CompanionShell: stub("CompanionShell"),
    CompanionView: stub("CompanionView"),
    ConnectionFailedBanner: stub("ConnectionFailedBanner"),
    ConnectorsPageView: stub("ConnectorsPageView"),
    ConversationsSidebar: stub("ConversationsSidebar"),
    CustomActionEditor: stub("CustomActionEditor"),
    CustomActionsPanel: stub("CustomActionsPanel"),
    GameViewOverlay: stub("GameViewOverlay"),
    Header: stub("Header"),
    HeartbeatsView: stub("HeartbeatsView"),
    InventoryView: stub("InventoryView"),
    KnowledgeView: stub("KnowledgeView"),
    OnboardingWizard: stub("OnboardingWizard"),

    PairingView: stub("PairingView"),
    SaveCommandModal: stub("SaveCommandModal"),
    SettingsView: stub("SettingsView"),
    SharedCompanionScene: passthrough,
    ShellOverlays: stub("ShellOverlays"),
    StartupFailureView: ({ error }: { error: { message: string } }) =>
      React.createElement(
        "div",
        { "data-testid": "StartupFailureView" },
        error.message,
      ),
    StartupShell: () => {
      const app = useAppMock();
      const coordPhase = app?.startupCoordinator?.phase ?? "restoring-session";
      if (coordPhase === "error") {
        const err = app?.startupError ?? {
          message: "Startup error",
          reason: "unknown",
          phase: "starting-backend",
        };
        return React.createElement(
          "div",
          { "data-testid": "StartupFailureView" },
          err.message,
        );
      }
      return React.createElement("div", { "data-testid": "StartupShell" });
    },
    StreamView: stub("StreamView"),
    SystemWarningBanner: stub("SystemWarningBanner"),
  };
});

vi.mock("./components/FlaminaGuide", () => ({
  DeferredSetupChecklist: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      "div",
      { "data-testid": "DeferredSetupChecklist" },
      children,
    ),
}));

vi.mock("./components/chat/TasksEventsPanel", () => ({
  TasksEventsPanel: ({ open }: { open?: boolean }) =>
    React.createElement("div", {
      "data-testid": "TasksEventsPanel",
      "data-open": String(open),
    }),
}));

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    subscribeDesktopBridgeEventMock.mockReset().mockReturnValue(vi.fn());
    keyboardSetScrollMock.mockReset();
    useAppMock.mockReset();
    useBugReportStateMock.mockReset().mockReturnValue({});
    useContextMenuMock.mockReset().mockReturnValue({
      saveCommandModalOpen: false,
      saveCommandText: "",
      confirmSaveCommand: vi.fn(),
      closeSaveCommandModal: vi.fn(),
    });
    useStreamPopoutNavigationMock.mockReset();
  });

  it("keeps hook order stable when startupError appears after the app has mounted", async () => {
    const appState = {
      onboardingLoading: false,
      startupPhase: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab: "stream",
      setTab: vi.fn(),
      actionNotice: null,
      uiShellMode: "native",
      agentStatus: { state: "running" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
    };
    useAppMock.mockImplementation(() => appState);

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(App));
    });

    // Transition the coordinator to the error phase — StartupShell renders
    // StartupFailureView when the coordinator is in the error phase.
    appState.startupCoordinator = {
      phase: "error",
      state: {
        phase: "error",
        reason: "agent-error",
        message: "backend died",
        timedOut: false,
      },
      retry: vi.fn(),
    };
    appState.startupError = {
      reason: "agent-error",
      phase: "ready",
      message: "backend died",
    };

    await act(async () => {
      renderer?.update(React.createElement(App));
    });

    if (!renderer) {
      throw new Error("App did not render");
    }

    expect(
      renderer.root.findByProps({ "data-testid": "StartupFailureView" })
        .children,
    ).toContain("backend died");
  });

  it("mounts advanced-family tabs in the dedicated advanced shell instead of the padded default main shell", async () => {
    const makeState = (tab: string) => ({
      onboardingLoading: false,
      onboardingHandoffError: null,
      onboardingHandoffPhase: "idle",
      startupPhase: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab,
      setTab: vi.fn(),
      setState: vi.fn(),
      actionNotice: null,
      uiShellMode: "native",
      switchShellView: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      chatAgentVoiceMuted: false,
      cancelOnboardingHandoff: vi.fn(),
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      agentStatus: { state: "running" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      retryOnboardingHandoff: vi.fn(),
      t: (key: string) => key,
    });

    for (const tab of ["plugins", "skills", "trajectories"] as const) {
      useAppMock.mockImplementation(() => makeState(tab));

      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(App));
      });

      renderer.root.findByProps({
        "data-testid": "AdvancedPageView",
      });
      const advancedShells = renderer.root.findAll(
        (node) =>
          node.type === "div" &&
          typeof node.props.className === "string" &&
          node.props.className.includes("flex flex-1 min-h-0 min-w-0") &&
          node.findAllByProps({ "data-testid": "AdvancedPageView" }).length > 0,
      );
      const paddedMain = renderer.root.findAll(
        (node) =>
          node.type === "main" &&
          typeof node.props.className === "string" &&
          node.props.className.includes("px-3 xl:px-5 py-4 xl:py-6"),
      );

      expect(advancedShells.length).toBeGreaterThan(0);
      expect(paddedMain.length).toBe(0);
    }
  });

  it("renders the workspace widget rail by default on desktop chat", async () => {
    window.innerWidth = 1440;

    useAppMock.mockImplementation(() => ({
      onboardingLoading: false,
      startupPhase: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab: "chat",
      setTab: vi.fn(),
      actionNotice: null,
      uiShellMode: "native",
      agentStatus: { state: "running" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    }));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(App));
    });

    const panel = renderer.root.findByProps({
      "data-testid": "TasksEventsPanel",
    });
    expect(panel.props["data-open"]).toBe("true");
  });

  it("shows a shutdown overlay when desktop quit starts", async () => {
    let shutdownListener: ((payload: unknown) => void) | null = null;
    subscribeDesktopBridgeEventMock.mockImplementation(
      ({ listener }: { listener: (payload: unknown) => void }) => {
        shutdownListener = listener;
        return vi.fn();
      },
    );

    useAppMock.mockImplementation(() => ({
      onboardingLoading: false,
      onboardingHandoffError: null,
      onboardingHandoffPhase: "idle",
      startupPhase: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab: "chat",
      setTab: vi.fn(),
      setState: vi.fn(),
      actionNotice: null,
      uiShellMode: "native",
      switchShellView: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "dark",
      setUiTheme: vi.fn(),
      chatAgentVoiceMuted: false,
      cancelOnboardingHandoff: vi.fn(),
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      agentStatus: { state: "running" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      retryOnboardingHandoff: vi.fn(),
      t: (key: string, vars?: { defaultValue?: string }) =>
        vars?.defaultValue ?? key,
    }));

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(App));
    });

    expect(
      renderer.root.findAll((node) => node.props.role === "status"),
    ).toHaveLength(0);

    await act(async () => {
      shutdownListener?.({ reason: "before-quit" });
    });

    expect(
      renderer.root.findAll((node) => node.props.role === "status"),
    ).toHaveLength(1);
  });
});
