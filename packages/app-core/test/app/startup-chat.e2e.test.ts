// @vitest-environment jsdom

import { pathForTab, tabFromPath } from "@miladyai/app-core/navigation";
import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/state")
  >("@miladyai/app-core/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
    getVrmUrl: vi.fn(),
    getVrmPreviewUrl: vi.fn(),
    getVrmTitle: vi.fn(),
  };
});

vi.mock("../../src/state", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/state")>("../../src/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
    getVrmUrl: vi.fn(),
    getVrmPreviewUrl: vi.fn(),
    getVrmTitle: vi.fn(),
  };
});

vi.mock("@miladyai/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    DrawerSheet: ({
      open,
      children,
    }: {
      open?: boolean;
      children?: React.ReactNode;
    }) => (open ? React.createElement(React.Fragment, null, children) : null),
    DrawerSheetContent: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    DrawerSheetHeader: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
    DrawerSheetTitle: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement("div", props, children),
  };
});

vi.mock("@miladyai/ui", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const actual =
    await vi.importActual<typeof import("@miladyai/ui")>("@miladyai/ui");

  return {
    ...actual,
    DrawerSheet: ({
      children,
      open,
    }: {
      children?: React.ReactNode;
      open?: boolean;
    }) => (open ? React.createElement(React.Fragment, null, children) : null),
    DrawerSheetContent: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    DrawerSheetHeader: ({ children, ...props }: React.ComponentProps<"div">) =>
      React.createElement("div", props, children),
    DrawerSheetTitle: ({ children, ...props }: React.ComponentProps<"h2">) =>
      React.createElement("h2", props, children),
  };
});

vi.mock("@miladyai/app-core/components", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/components")
  >("@miladyai/app-core/components");
  return {
    ...actual,
    AdvancedPageView: () =>
      React.createElement("div", null, "AdvancedPageView"),
    AppsPageView: () => React.createElement("div", null, "AppsPageView"),
    CharacterView: () => React.createElement("div", null, "CharacterView"),
    ChatView: () => React.createElement("div", null, "ChatView"),
    CommandPalette: () => React.createElement("div", null, "CommandPalette"),
    CompanionView: () => React.createElement("div", null, "CompanionView"),
    ConnectorsPageView: () =>
      React.createElement("div", null, "ConnectorsPageView"),
    ConversationsSidebar: () =>
      React.createElement("div", null, "ConversationsSidebar"),
    EmotePicker: () => React.createElement("div", null, "EmotePicker"),
    Header: ({ mobileLeft }: { mobileLeft?: React.ReactNode }) =>
      React.createElement("div", null, "Header", mobileLeft),
    InventoryView: () => React.createElement("div", null, "InventoryView"),
    KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
    OnboardingWizard: () =>
      React.createElement("div", null, "OnboardingWizard"),
    PairingView: () => React.createElement("div", null, "PairingView"),
    SharedCompanionScene: ({
      children,
    }: {
      active: boolean;
      children: React.ReactNode;
    }) => React.createElement(React.Fragment, null, children),
    ShellOverlays: () => null,
    SettingsView: () => React.createElement("div", null, "SettingsView"),
    StreamView: () => React.createElement("div", null, "StreamView"),
  };
});

vi.mock("@miladyai/app-core/src/components/Header", () => ({
  Header: ({ mobileLeft }: { mobileLeft?: React.ReactNode }) =>
    React.createElement("div", null, "Header", mobileLeft),
}));
vi.mock("@miladyai/app-core/src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("@miladyai/app-core/src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("@miladyai/app-core/src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("@miladyai/app-core/src/components/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));
vi.mock("@miladyai/app-core/src/components/ChatView", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("@miladyai/app-core/src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("@miladyai/app-core/src/components/AppsPageView", () => ({
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
}));
vi.mock("@miladyai/app-core/src/components/AdvancedPageView", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
}));
vi.mock("@miladyai/app-core/src/components/CharacterView", () => ({
  CharacterView: () => React.createElement("div", null, "CharacterView"),
}));
vi.mock("@miladyai/app-core/src/components/TriggersView", () => ({
  TriggersView: () => React.createElement("div", null, "TriggersView"),
}));
vi.mock("@miladyai/app-core/src/components/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
}));
vi.mock("@miladyai/app-core/src/components/InventoryView", () => ({
  InventoryView: () => React.createElement("div", null, "InventoryView"),
}));
vi.mock("@miladyai/app-core/src/components/KnowledgeView", () => ({
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
}));
vi.mock("../../src/components/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));
vi.mock("@miladyai/app-core/src/components/StreamView", () => ({
  StreamView: () => React.createElement("div", null, "StreamView"),
}));
vi.mock("@miladyai/app-core/src/components/CompanionView", () => ({
  CompanionView: () => React.createElement("div", null, "CompanionView"),
}));

vi.mock("../../src/app-shell-components", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
  BugReportModal: () => React.createElement("div", null, "BugReportModal"),
  CharacterEditor: () => React.createElement("div", null, "CharacterView"),
  ChatView: () => React.createElement("div", null, "ChatView"),
  CompanionShell: ({ tab }: { tab: string }) =>
    React.createElement("main", null, `CompanionShell:${tab}`),
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
  Header: ({ mobileLeft }: { mobileLeft?: React.ReactNode }) =>
    React.createElement("div", null, "Header", mobileLeft),
  HeartbeatsView: () => React.createElement("div", null, "HeartbeatsView"),
  InventoryView: () => React.createElement("div", null, "InventoryView"),
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
  PairingView: () => React.createElement("div", null, "PairingView"),
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
  SettingsView: () => React.createElement("div", null, "SettingsView"),
  SharedCompanionScene: ({
    children,
  }: {
    active: boolean;
    children: React.ReactNode;
  }) => React.createElement(React.Fragment, null, children),
  ShellOverlays: () => null,
  StartupFailureView: () =>
    React.createElement("div", null, "StartupFailureView"),
  StreamView: () => React.createElement("div", null, "StreamView"),
  SystemWarningBanner: () =>
    React.createElement("div", null, "SystemWarningBanner"),
}));

vi.mock(
  "@miladyai/app-core/src/components/companion/CompanionSceneHost",
  async () => {
    const React = await vi.importActual<typeof import("react")>("react");
    return {
      SharedCompanionScene: ({
        children,
      }: {
        active: boolean;
        children: React.ReactNode;
      }) => React.createElement(React.Fragment, null, children),
      CompanionSceneHost: () => null,
      useSharedCompanionScene: () => true,
    };
  },
);

import { App } from "../../src/App";
import { AppContext } from "../../src/state/useApp";

const ORIGINAL_INNER_WIDTH = window.innerWidth;
const TRANSLATIONS: Record<string, string> = {
  "conversations.chats": "Chats",
};

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function buttonText(node: ReactTestInstance): string {
  return textOf(node).trim();
}

function renderApp(): React.ReactElement {
  return React.createElement(
    AppContext.Provider,
    { value: mockUseApp() as never },
    React.createElement(App),
  );
}

describe("app startup routing (e2e)", () => {
  beforeEach(() => {
    setViewportWidth(1280);
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      t: (k: string) => TRANSLATIONS[k] ?? k,
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
      setActionNotice: vi.fn(),
      plugins: [],
      conversations: [],
      elizaCloudCredits: null,
      uiShellMode: "native",
      agentStatus: { state: "running", agentName: "Milady" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      startupPhase: "ready",
      startupStatus: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      startupCoordinatorLegacyPhase: "ready" as const,
      retryStartup: vi.fn(),
    });
  });

  afterEach(() => {
    setViewportWidth(ORIGINAL_INNER_WIDTH);
    window.history.pushState({}, "", "/");
  });

  it("renders chat screen when startup state is ready", async () => {
    vi.useFakeTimers();
    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        tree = TestRenderer.create(renderApp());
      });

      let renderedText = textOf(tree.root);

      expect(renderedText).toContain("ChatView");
      // AvatarLoader was removed from VrmStage — VRM loads silently now
      expect(renderedText).not.toContain("OnboardingWizard");
      expect(renderedText).not.toContain("PairingView");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders wallets screen when wallets tab is active", async () => {
    mockUseApp.mockReturnValue({
      t: (k: string) => TRANSLATIONS[k] ?? k,
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "wallets",
      actionNotice: null,
      setActionNotice: vi.fn(),
      plugins: [],
      conversations: [],
      elizaCloudCredits: null,
      uiShellMode: "native",
      agentStatus: { state: "running", agentName: "Milady" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      startupPhase: "ready",
      startupStatus: "ready",
      startupError: null,
      startupCoordinator: { phase: "ready" },
      startupCoordinatorLegacyPhase: "ready" as const,
      retryStartup: vi.fn(),
    });

    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(renderApp());
    });

    const renderedText = textOf(tree.root);

    expect(renderedText).toContain("InventoryView");
    expect(renderedText).not.toContain("ChatView");
  });

  it("keeps legacy inventory path mapped to wallets", () => {
    expect(pathForTab("wallets")).toBe("/wallets");
    expect(tabFromPath("/wallets")).toBe("wallets");
    expect(tabFromPath("/inventory")).toBe("wallets");
  });

  it("uses mobile chat drawers on narrow viewports", async () => {
    setViewportWidth(390);

    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(renderApp());
    });

    const root = tree?.root;
    const buttons = root.findAllByType("button");
    const chatDrawerButton = buttons.find(
      (node) =>
        node.props["aria-label"] === "aria.openChatsPanel" ||
        buttonText(node).includes("conversations.chats"),
    );
    expect(chatDrawerButton).toBeDefined();

    let renderedText = textOf(root);
    expect(renderedText).not.toContain("ConversationsSidebar");

    await act(async () => {
      chatDrawerButton?.props.onClick();
    });

    renderedText = textOf(root);
    expect(renderedText).toContain("ConversationsSidebar");
  });

  it("keeps the desktop chat workspace height-bounded", async () => {
    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(renderApp());
    });

    const main = tree.root.findByType("main");
    expect(String(main.props.className)).toContain("min-h-0");
    expect(String(main.props.className)).toContain("overflow-hidden");
  });

  it("keeps the mobile chat workspace height-bounded", async () => {
    setViewportWidth(390);

    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(renderApp());
    });

    const main = tree.root.findByType("main");
    expect(String(main.props.className)).toContain("min-h-0");
    expect(String(main.props.className)).toContain("overflow-hidden");
  });
});
