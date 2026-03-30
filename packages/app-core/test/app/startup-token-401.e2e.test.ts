// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";

vi.mock("../../src/app-shell-components", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
  BugReportModal: () => React.createElement("div", null, "BugReportModal"),
  CharacterEditor: () => React.createElement("div", null, "CharacterEditor"),
  ChatView: () => React.createElement("div", null, "ChatView"),
  CompanionShell: () => React.createElement("div", null, "CompanionShell"),
  CompanionView: () => React.createElement("div", null, "CompanionView"),
  ConnectionFailedBanner: () =>
    React.createElement("div", null, "ConnectionFailedBanner"),
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
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
  PairingView: () => React.createElement("div", null, "PairingView"),
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
  SettingsView: () => React.createElement("div", null, "SettingsView"),
  SharedCompanionScene: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  ShellOverlays: () => null,
  StartupFailureView: () =>
    React.createElement("div", null, "StartupFailureView"),
  StreamView: () => React.createElement("div", null, "StreamView"),
  SystemWarningBanner: () =>
    React.createElement("div", null, "SystemWarningBanner"),
}));

import { App } from "../../src/App";
import { AppContext } from "../../src/state/useApp";

describe("startup stale token handling", () => {
  it("lands in pairing/auth instead of surfacing a startup failure", async () => {
    const state = {
      t: (key: string) => key,
      onboardingLoading: false,
      onboardingHandoffError: null,
      onboardingHandoffPhase: "idle",
      startupPhase: "ready",
      startupError: null,
      authRequired: true,
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
      uiTheme: "light",
      setUiTheme: vi.fn(),
      chatAgentVoiceMuted: false,
      cancelOnboardingHandoff: vi.fn(),
      handleSaveCharacter: vi.fn(),
      characterSaving: false,
      characterSaveSuccess: false,
      agentStatus: null,
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      retryOnboardingHandoff: vi.fn(async () => {}),
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
    expect(rendered).toContain("PairingView");
    expect(rendered).not.toContain("StartupFailureView");
    expect(rendered).not.toContain("OnboardingWizard");

    await act(async () => {
      tree?.unmount();
    });
  });
});
