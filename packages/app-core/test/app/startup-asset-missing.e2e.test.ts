// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";

vi.mock("../../src/app-shell-components", async () => {
  const { useApp } = await import("../../src/state");

  const StartupFailureViewMock = ({
    error,
  }: {
    error: { detail?: string; message: string; reason: string };
  }) =>
    React.createElement(
      "div",
      null,
      `StartupFailureView:${error.reason}:${error.message}:${error.detail ?? ""}`,
    );

  return {
    AdvancedPageView: () =>
      React.createElement("div", null, "AdvancedPageView"),
    AppsPageView: () => React.createElement("div", null, "AppsPageView"),
    AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
    BugReportModal: () => React.createElement("div", null, "BugReportModal"),
    CharacterEditor: () => React.createElement("div", null, "CharacterEditor"),
    ChatView: () => React.createElement("div", null, "ChatView"),
    CompanionShell: () => React.createElement("div", null, "CompanionShell"),
    CompanionView: () => React.createElement("div", null, "CompanionView"),
    ConnectionFailedBanner: () =>
      React.createElement("div", null, "ConnectionFailedBanner"),
    ConnectionLostOverlay: () => null,
    ConnectorsPageView: () =>
      React.createElement("div", null, "ConnectorsPageView"),
    ConversationsSidebar: () =>
      React.createElement("div", null, "ConversationsSidebar"),
    CustomActionEditor: () =>
      React.createElement("div", null, "CustomActionEditor"),
    CustomActionsPanel: () =>
      React.createElement("div", null, "CustomActionsPanel"),
    GameViewOverlay: () => React.createElement("div", null, "GameViewOverlay"),
    Header: () => React.createElement("div", null, "Header"),
    HeartbeatsView: () => React.createElement("div", null, "HeartbeatsView"),
    InventoryView: () => React.createElement("div", null, "InventoryView"),
    KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
    OnboardingWizard: () =>
      React.createElement("div", null, "OnboardingWizard"),
    PairingView: () => React.createElement("div", null, "PairingView"),
    SaveCommandModal: () =>
      React.createElement("div", null, "SaveCommandModal"),
    SettingsView: () => React.createElement("div", null, "SettingsView"),
    SharedCompanionScene: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    ShellOverlays: () => null,
    StartupFailureView: StartupFailureViewMock,
    StartupShell: () => {
      const { startupCoordinator, startupError, retryStartup } = useApp();
      const phase = startupCoordinator.phase;
      if (phase === "error") {
        const errState = startupError ?? {
          reason:
            (startupCoordinator as { phase: "error"; reason: string }).reason ??
            "unknown",
          message:
            (startupCoordinator as { phase: "error"; message: string })
              .message ?? "Unknown error",
          phase: "starting-backend" as const,
        };
        return React.createElement(StartupFailureViewMock, { error: errState });
      }
      if (phase === "pairing-required") {
        return React.createElement("div", null, "PairingView");
      }
      if (phase === "onboarding-required") {
        return React.createElement("div", null, "OnboardingWizard");
      }
      return null;
    },
    StreamView: () => React.createElement("div", null, "StreamView"),
    SystemWarningBanner: () =>
      React.createElement("div", null, "SystemWarningBanner"),
  };
});

import { App } from "../../src/App";
import { AppContext } from "../../src/state/useApp";

describe("startup failure: bundled assets missing", () => {
  it("surfaces the startup failure view for asset-missing errors", async () => {
    const state = {
      t: (key: string) => key,
      onboardingLoading: false,
      startupPhase: "initializing-agent",
      startupCoordinator: {
        phase: "error",
        reason: "asset-missing",
        message: "Required companion assets could not be loaded.",
        timedOut: false,
      },
      startupCoordinatorLegacyPhase: "initializing-agent" as const,
      startupError: {
        reason: "asset-missing",
        phase: "initializing-agent",
        message: "Required companion assets could not be loaded.",
        detail: "Bundled avatar ELIZA-01 could not be loaded.",
      },
      authRequired: false,
      onboardingComplete: true,
      retryStartup: vi.fn(),
      tab: "companion",
      setTab: vi.fn(),
      setState: vi.fn(),
      actionNotice: null,
      uiShellMode: "companion",
      switchShellView: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiTheme: "light",
      setUiTheme: vi.fn(),
      chatAgentVoiceMuted: false,
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      agentStatus: null,
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
    };

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppContext.Provider,
          { value: state as never },
          React.createElement(App),
        ),
      );
    });

    const rendered = textOf(tree!.root);
    expect(rendered).toContain("StartupFailureView:asset-missing");
    expect(rendered).toContain(
      "Required companion assets could not be loaded.",
    );
    expect(rendered).toContain("Bundled avatar ELIZA-01 could not be loaded.");
    expect(rendered).not.toContain("PairingView");

    await act(async () => {
      tree?.unmount();
    });
  });
});
