// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  keyboardSetScrollMock,
  useAppMock,
  useBugReportStateMock,
  useContextMenuMock,
  useStreamPopoutNavigationMock,
} = vi.hoisted(() => ({
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
  isLifoPopoutValue: vi.fn(() => false),
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

vi.mock("./components", () => {
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
    ErrorBoundary: passthrough,
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

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
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
});
