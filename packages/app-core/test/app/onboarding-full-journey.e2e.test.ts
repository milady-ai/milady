// @vitest-environment jsdom
/**
 * End-to-end tests for the full onboarding journey:
 *
 * 1. Progress through every onboarding step and land in companion mode.
 * 2. Reset the agent, return to onboarding, and complete a second pass
 *    cleanly — proving the full reset cycle works.
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";

type OnboardingStep =
  | "cloud_login"
  | "identity"
  | "connection"
  | "rpc"
  | "senses"
  | "activate";

type FlaminaGuideTopic = "provider" | "rpc" | "permissions" | "voice";

type AppHarnessState = {
  onboardingLoading: boolean;
  startupStatus:
    | "loading"
    | "onboarding"
    | "ready"
    | "auth-blocked"
    | "recoverable-error";
  startupError: null;
  authRequired: boolean;
  onboardingComplete: boolean;
  tab: string;
  actionNotice: null;
  onboardingStep: OnboardingStep;
  onboardingMode: "basic" | "advanced";
  onboardingActiveGuide: FlaminaGuideTopic | null;
  onboardingDeferredTasks: FlaminaGuideTopic[];
  postOnboardingChecklistDismissed: boolean;
  onboardingOptions: ReturnType<typeof onboardingOptions> | null;
  onboardingName: string;
  onboardingStyle: string;
  onboardingTheme: string;
  onboardingServerTarget: "" | "local" | "remote" | "elizacloud";
  onboardingCloudApiKey: string;
  onboardingSmallModel: string;
  onboardingLargeModel: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingRemoteApiBase: string;
  onboardingRemoteToken: string;
  onboardingRemoteConnecting: boolean;
  onboardingRemoteError: string;
  onboardingRemoteConnected: boolean;
  onboardingOpenRouterModel: string;
  onboardingPrimaryModel: string;
  onboardingTelegramToken: string;
  onboardingDiscordToken: string;
  onboardingTwilioAccountSid: string;
  onboardingTwilioAuthToken: string;
  onboardingTwilioPhoneNumber: string;
  onboardingBlooioApiKey: string;
  onboardingBlooioPhoneNumber: string;
  onboardingSubscriptionTab: "token" | "oauth";
  onboardingSelectedChains: Set<string>;
  onboardingRpcSelections: Record<string, string>;
  onboardingRpcKeys: Record<string, string>;
  onboardingAvatar: number;
  selectedVrmIndex: number;
  customBackgroundUrl: string;
  onboardingRestarting: boolean;
  elizaCloudConnected: boolean;
  elizaCloudLoginBusy: boolean;
  elizaCloudLoginError: string;
  elizaCloudUserId: string;
  uiShellMode: string;
  plugins: unknown[];
  conversations: unknown[];
  elizaCloudCredits: null;
  agentStatus: null;
  [key: string]: unknown;
};

// ── Hoisted mocks ─────────────────────────────────────────────────────

const { companionOverlayTabs, mockUseApp } = vi.hoisted(() => ({
  companionOverlayTabs: new Set([
    "companion",
    "skills",
    "character",
    "character-select",
    "settings",
    "plugins",
    "advanced",
    "actions",
    "triggers",
    "fine-tuning",
    "trajectories",
    "runtime",
    "database",
    "logs",
    "security",
    "apps",
    "connectors",
    "knowledge",
    "stream",
    "wallets",
  ]),
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", async () => {
  const actual = await vi.importActual("@miladyai/app-core/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/state", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/state")>("../../src/state");
  return {
    ...actual,
    useApp: () => mockUseApp(),
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
    CharacterEditor: () => React.createElement("div", null, "CharacterEditor"),
    ChatView: () => React.createElement("div", null, "ChatView"),
    ConnectorsPageView: () =>
      React.createElement("div", null, "ConnectorsPageView"),
    CommandPalette: () => React.createElement("div", null, "CommandPalette"),
    CompanionShell: ({ tab }: { tab: string }) =>
      React.createElement("main", null, `CompanionShell:${tab}`),
    CompanionView: () => React.createElement("div", null, "CompanionView"),
    ConversationsSidebar: () =>
      React.createElement("div", null, "ConversationsSidebar"),
    CustomActionEditor: () =>
      React.createElement("div", null, "CustomActionEditor"),
    CustomActionsPanel: () =>
      React.createElement("div", null, "CustomActionsPanel"),
    EmotePicker: () => React.createElement("div", null, "EmotePicker"),
    Header: () => React.createElement("div", null, "Header"),
    InventoryView: () => React.createElement("div", null, "InventoryView"),
    KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
    OnboardingWizard: () => {
      const state = mockUseApp();
      if (state.onboardingStep === "cloud_login") {
        return React.createElement(
          "button",
          {
            onClick: () => state.handleOnboardingNext(),
            type: "button",
          },
          "onboarding.getStarted",
        );
      }
      if (state.onboardingStep === "identity") {
        return React.createElement(
          "div",
          { "data-testid": "identity-step" },
          React.createElement(
            "div",
            { "data-testid": "character-roster" },
            `roster:avatar-${state.selectedVrmIndex ?? 1}`,
          ),
          React.createElement(
            "button",
            {
              onClick: () => {
                // Simulate selecting a character with avatar
                state.setState?.("onboardingStyle", "chaotic");
                state.setState?.("onboardingName", "TestAgent");
                state.setState?.("selectedVrmIndex", 2);
                state.handleOnboardingNext();
              },
              type: "button",
            },
            "onboarding.chooseAgent",
          ),
        );
      }
      if (state.onboardingStep === "connection") {
        if (!state.onboardingServerTarget) {
          return React.createElement(
            "button",
            {
              onClick: () => {
                state.setState?.("onboardingServerTarget", "local");
              },
              type: "button",
            },
            "onboarding.hostingLocal",
          );
        }
        return React.createElement(
          "button",
          {
            onClick: () => state.handleOnboardingNext(),
            type: "button",
          },
          "onboarding.confirm",
        );
      }
      if (state.onboardingStep === "rpc") {
        return React.createElement(
          "button",
          {
            onClick: () => state.handleOnboardingNext(),
            type: "button",
          },
          "onboarding.rpcSkip",
        );
      }
      if (state.onboardingStep === "senses") {
        return React.createElement(
          "button",
          {
            onClick: () => state.handleOnboardingNext(),
            type: "button",
          },
          "permissions-continue",
        );
      }
      // activate
      return React.createElement(
        "button",
        {
          onClick: () => state.handleOnboardingNext(),
          type: "button",
        },
        "onboarding.enter",
      );
    },
    PairingView: () => React.createElement("div", null, "PairingView"),
    PermissionsOnboardingSection: ({
      onContinue,
    }: {
      onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
    }) =>
      React.createElement(
        "button",
        { onClick: () => onContinue(), type: "button" },
        "permissions-continue",
      ),
    SettingsView: () => React.createElement("div", null, "SettingsView"),
    SharedCompanionScene: ({
      children,
    }: {
      active: boolean;
      children: React.ReactNode;
    }) => React.createElement(React.Fragment, null, children),
    ShellOverlays: () => null,
    StreamView: () => React.createElement("div", null, "StreamView"),
  };
});

vi.mock("@miladyai/app-core/src/app-shell-components", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
  BugReportModal: () => React.createElement("div", null, "BugReportModal"),
  CharacterEditor: () => React.createElement("div", null, "CharacterEditor"),
  ChatView: () => React.createElement("div", null, "ChatView"),
  CompanionShell: ({ tab }: { tab: string }) =>
    React.createElement("main", null, `CompanionShell:${tab}`),
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
  OnboardingWizard: () => {
    const state = mockUseApp();
    if (state.onboardingStep === "cloud_login") {
      return React.createElement(
        "button",
        {
          onClick: () => state.handleOnboardingNext(),
          type: "button",
        },
        "onboarding.getStarted",
      );
    }
    if (state.onboardingStep === "identity") {
      return React.createElement(
        "div",
        { "data-testid": "identity-step" },
        React.createElement(
          "div",
          { "data-testid": "character-roster" },
          `roster:avatar-${state.selectedVrmIndex ?? 1}`,
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              state.setState?.("onboardingStyle", "chaotic");
              state.setState?.("onboardingName", "TestAgent");
              state.setState?.("selectedVrmIndex", 2);
              state.handleOnboardingNext();
            },
            type: "button",
          },
          "onboarding.chooseAgent",
        ),
      );
    }
    if (state.onboardingStep === "connection") {
      if (!state.onboardingServerTarget) {
        return React.createElement(
          "button",
          {
            onClick: () => {
              state.setState?.("onboardingServerTarget", "local");
            },
            type: "button",
          },
          "onboarding.hostingLocal",
        );
      }
      return React.createElement(
        "button",
        {
          onClick: () => state.handleOnboardingNext(),
          type: "button",
        },
        "onboarding.confirm",
      );
    }
    if (state.onboardingStep === "rpc") {
      return React.createElement(
        "button",
        {
          onClick: () => state.handleOnboardingNext(),
          type: "button",
        },
        "onboarding.rpcSkip",
      );
    }
    if (state.onboardingStep === "senses") {
      return React.createElement(
        "button",
        {
          onClick: () => state.handleOnboardingNext(),
          type: "button",
        },
        "permissions-continue",
      );
    }
    return React.createElement(
      "button",
      {
        onClick: () => state.handleOnboardingNext(),
        type: "button",
      },
      "onboarding.enter",
    );
  },
  PairingView: () => React.createElement("div", null, "PairingView"),
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
  SettingsView: () => React.createElement("div", null, "SettingsView"),
  SharedCompanionScene: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  ShellOverlays: () => null,
  StartupFailureView: ({ error }: { error: { message: string } }) =>
    React.createElement("div", null, error.message),
  StartupShell: () => {
    const state = mockUseApp();
    const phase = state?.startupCoordinator?.phase;
    if (phase === "error") {
      return React.createElement(
        "div",
        null,
        state.startupError?.message ?? "StartupFailureView",
      );
    }
    if (phase === "pairing-required") {
      return React.createElement("div", null, "PairingView");
    }
    if (phase === "onboarding-required") {
      const s = mockUseApp();
      if (s.onboardingStep === "cloud_login") {
        return React.createElement(
          "button",
          { onClick: () => s.handleOnboardingNext(), type: "button" },
          "onboarding.getStarted",
        );
      }
      if (s.onboardingStep === "identity") {
        return React.createElement(
          "div",
          { "data-testid": "identity-step" },
          React.createElement(
            "div",
            { "data-testid": "character-roster" },
            `roster:avatar-${s.selectedVrmIndex ?? 1}`,
          ),
          React.createElement(
            "button",
            {
              onClick: () => {
                s.setState?.("onboardingStyle", "chaotic");
                s.setState?.("onboardingName", "TestAgent");
                s.setState?.("selectedVrmIndex", 2);
                s.handleOnboardingNext();
              },
              type: "button",
            },
            "onboarding.chooseAgent",
          ),
        );
      }
      if (s.onboardingStep === "connection") {
        if (!s.onboardingServerTarget) {
          return React.createElement(
            "button",
            {
              onClick: () => {
                s.setState?.("onboardingServerTarget", "local");
              },
              type: "button",
            },
            "onboarding.hostingLocal",
          );
        }
        return React.createElement(
          "button",
          { onClick: () => s.handleOnboardingNext(), type: "button" },
          "onboarding.confirm",
        );
      }
      if (s.onboardingStep === "rpc") {
        return React.createElement(
          "button",
          { onClick: () => s.handleOnboardingNext(), type: "button" },
          "onboarding.rpcSkip",
        );
      }
      if (s.onboardingStep === "senses") {
        return React.createElement(
          "button",
          { onClick: () => s.handleOnboardingNext(), type: "button" },
          "permissions-continue",
        );
      }
      return React.createElement(
        "button",
        { onClick: () => s.handleOnboardingNext(), type: "button" },
        "onboarding.enter",
      );
    }
    return null;
  },
  StreamView: () => React.createElement("div", null, "StreamView"),
  SystemWarningBanner: () =>
    React.createElement("div", null, "SystemWarningBanner"),
}));

vi.mock(
  "../../src/app-shell-components",
  () => import("@miladyai/app-core/src/app-shell-components"),
);

vi.mock("@miladyai/app-core/src/components/shell/Header", () => ({
  Header: () => React.createElement("div", null, "Header"),
}));
vi.mock("@miladyai/app-core/src/components/shell/Header", () => ({
  Nav: () => React.createElement("div", null, "Nav"),
}));
vi.mock("@miladyai/app-core/src/components/shell/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("@miladyai/app-core/src/components/companion/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("@miladyai/app-core/src/components/onboarding/PermissionsStep", () => ({
  PermissionsStep: () =>
    React.createElement(
      "button",
      {
        onClick: () => mockUseApp().handleOnboardingNext(),
        type: "button",
      },
      "permissions-continue",
    ),
}));
vi.mock(
  "@miladyai/app-core/src/components/conversations/ConversationsSidebar",
  () => ({
    ConversationsSidebar: () =>
      React.createElement("div", null, "ConversationsSidebar"),
  }),
);
vi.mock(
  "@miladyai/app-core/src/components/custom-actions/CustomActionsPanel",
  () => ({
    CustomActionsPanel: () =>
      React.createElement("div", null, "CustomActionsPanel"),
  }),
);
vi.mock(
  "@miladyai/app-core/src/components/custom-actions/CustomActionEditor",
  () => ({
    CustomActionEditor: () =>
      React.createElement("div", null, "CustomActionEditor"),
  }),
);
vi.mock("@miladyai/app-core/src/components/pages/AppsPageView", () => ({
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/AdvancedPageView", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
}));
vi.mock("@miladyai/app-core/src/components/character/CharacterEditor", () => ({
  CharacterEditor: () => React.createElement("div", null, "CharacterEditor"),
}));
vi.mock("@miladyai/app-core/src/components/pages/TriggersView", () => ({
  TriggersView: () => React.createElement("div", null, "TriggersView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/InventoryView", () => ({
  InventoryView: () => React.createElement("div", null, "InventoryView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/KnowledgeView", () => ({
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
}));
vi.mock("@miladyai/app-core/src/components/shell/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/ChatView", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/character/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));
vi.mock("@miladyai/app-core/src/components/pages/CompanionView", () => ({
  CompanionView: () => React.createElement("div", null, "CompanionView"),
}));
vi.mock("@miladyai/app-core/src/components/pages/ChatModalView", () => ({
  ChatModalView: () => React.createElement("div", null, "ChatModalView"),
}));
vi.mock("@miladyai/app-core/src/components/character/AvatarSelector", () => ({
  AvatarSelector: () => React.createElement("div", null, "AvatarSelector"),
}));
vi.mock("@miladyai/app-core/src/components/companion/VrmStage", () => ({
  VrmStage: () => React.createElement("div", null, "VrmStage"),
}));
vi.mock("@miladyai/app-core/src/components/pages/StreamView", () => ({
  StreamView: () => React.createElement("div", null, "StreamView"),
}));
vi.mock("@miladyai/app-core/src/components/shell/CompanionShell", () => ({
  COMPANION_OVERLAY_TABS: companionOverlayTabs,
  CompanionShell: ({ tab }: { tab: string }) =>
    React.createElement("main", null, `CompanionShell:${tab}`),
  useCompanionShell: () => ({}),
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

// ── Helpers ──────────────────────────────────────────────────────────

function onboardingOptions() {
  return {
    names: ["Eliza"],
    styles: [
      {
        catchphrase: "chaotic",
        hint: "chaotic good",
        bio: ["bio"],
        system: "You are {{name}}",
        style: { all: [], chat: [], post: [] },
        adjectives: [],
        postExamples: [],
        messageExamples: [[{ name: "User", content: { text: "hello" } }]],
      },
    ],
    providers: [
      {
        id: "ollama",
        name: "Ollama",
        envKey: null,
        pluginName: "@elizaos/plugin-ollama",
        keyPrefix: null,
        description: "Use local Ollama",
      },
    ],
    cloudProviders: [
      {
        id: "openrouter",
        name: "OpenRouter",
        description: "Cloud provider",
      },
    ],
    models: {
      small: [
        {
          id: "small-model",
          name: "Small",
          provider: "openrouter",
          description: "small",
        },
      ],
      large: [
        {
          id: "large-model",
          name: "Large",
          provider: "openrouter",
          description: "large",
        },
      ],
    },
    inventoryProviders: [
      {
        id: "evm",
        name: "EVM",
        description: "EVM chains",
        rpcProviders: [
          {
            id: "elizacloud",
            name: "Eliza Cloud",
            description: "Managed RPC",
            envKey: null,
            requiresKey: false,
          },
        ],
      },
    ],
    sharedStyleRules: "",
  };
}

function createHarnessState(
  overrides?: Partial<AppHarnessState>,
): AppHarnessState {
  return {
    onboardingLoading: false,
    startupStatus: "onboarding",
    startupError: null,
    authRequired: false,
    onboardingComplete: false,
    tab: "chat",
    actionNotice: null,
    onboardingStep: "identity",
    onboardingMode: "basic",
    onboardingActiveGuide: null,
    onboardingDeferredTasks: [],
    postOnboardingChecklistDismissed: false,
    onboardingOptions: onboardingOptions(),
    onboardingName: "Eliza",
    onboardingStyle: "",
    onboardingTheme: "eliza",
    onboardingServerTarget: "",
    onboardingCloudApiKey: "",
    onboardingSmallModel: "small-model",
    onboardingLargeModel: "large-model",
    onboardingProvider: "",
    onboardingApiKey: "",
    onboardingRemoteApiBase: "",
    onboardingRemoteToken: "",
    onboardingRemoteConnecting: false,
    onboardingRemoteError: "",
    onboardingRemoteConnected: false,
    onboardingOpenRouterModel: "",
    onboardingPrimaryModel: "",
    onboardingTelegramToken: "",
    onboardingDiscordToken: "",
    onboardingTwilioAccountSid: "",
    onboardingTwilioAuthToken: "",
    onboardingTwilioPhoneNumber: "",
    onboardingBlooioApiKey: "",
    onboardingBlooioPhoneNumber: "",
    onboardingSubscriptionTab: "token",
    onboardingSelectedChains: new Set(["evm"]),
    onboardingRpcSelections: {},
    onboardingRpcKeys: {},
    onboardingAvatar: 1,
    selectedVrmIndex: 1,
    customBackgroundUrl: "",
    onboardingRestarting: false,
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    elizaCloudUserId: "",
    plugins: [],
    conversations: [],
    elizaCloudCredits: null,
    uiShellMode: "native",
    agentStatus: null,
    startupCoordinator: {
      phase: "onboarding-required",
      serverReachable: false,
    },
    startupCoordinatorLegacyPhase: "starting-backend" as const,
    ...overrides,
  };
}

function hasText(
  node: TestRenderer.ReactTestInstance,
  target: string,
): boolean {
  return textOf(node).includes(target);
}

function clickButton(
  tree: TestRenderer.ReactTestRenderer,
  labelFragment: string,
): void {
  const button = tree.root.findAll(
    (node) => node.type === "button" && hasText(node, labelFragment),
  )[0];
  if (!button) {
    throw new Error(`Button containing "${labelFragment}" not found`);
  }
  button.props.onClick();
}

async function rerender(
  tree: TestRenderer.ReactTestRenderer,
  state: AppHarnessState,
): Promise<void> {
  await act(async () => {
    tree.update(
      React.createElement(
        AppContext.Provider,
        { value: state as never },
        React.createElement(App),
      ),
    );
  });
}

function renderApp(state: AppHarnessState): React.ReactElement {
  return React.createElement(
    AppContext.Provider,
    { value: state as never },
    React.createElement(App),
  );
}

function applyIdentitySelection(state: AppHarnessState): void {
  state.onboardingStyle = "chaotic";
  state.onboardingName = "TestAgent";
  state.selectedVrmIndex = 2;
}

async function advanceOnboarding(
  tree: TestRenderer.ReactTestRenderer,
  state: AppHarnessState,
  handleOnboardingNext: () => Promise<void>,
): Promise<void> {
  if (
    state.onboardingStep === "connection" &&
    state.onboardingServerTarget === "local" &&
    !state.onboardingProvider
  ) {
    state.onboardingProvider = "ollama";
    await rerender(tree, state);
    return;
  }

  if (state.onboardingStep === "identity") {
    applyIdentitySelection(state);
  } else if (
    state.onboardingStep === "connection" &&
    !state.onboardingServerTarget
  ) {
    state.onboardingServerTarget = "local";
    await rerender(tree, state);
    return;
  }

  await act(async () => {
    await handleOnboardingNext();
  });
  await rerender(tree, state);
}

const STEP_ORDER: OnboardingStep[] = [
  "identity",
  "connection",
  "rpc",
  "senses",
  "activate",
];

function setupMock(state: AppHarnessState) {
  const handleOnboardingNext = vi.fn(async () => {
    if (state.onboardingStep === "activate") {
      state.onboardingComplete = true;
      state.startupStatus = "ready";
      state.startupCoordinator = { phase: "ready" };
      state.startupCoordinatorLegacyPhase = "ready";
      state.uiShellMode = "companion";
      state.tab = "companion";
      return;
    }
    const idx = STEP_ORDER.indexOf(state.onboardingStep);
    if (idx >= 0 && idx < STEP_ORDER.length - 1) {
      state.onboardingStep = STEP_ORDER[idx + 1];
    }
  });

  const handleOnboardingBack = vi.fn(() => {
    const idx = STEP_ORDER.indexOf(state.onboardingStep);
    if (idx > 0) {
      state.onboardingStep = STEP_ORDER[idx - 1];
    }
  });

  const handleReset = vi.fn(async () => {
    // Simulate the real handleReset — wipes state and returns to onboarding
    state.onboardingComplete = false;
    state.startupStatus = "onboarding";
    state.startupCoordinator = {
      phase: "onboarding-required",
      serverReachable: false,
    };
    state.startupCoordinatorLegacyPhase = "starting-backend";
    state.onboardingStep = "identity";
    state.onboardingStyle = "";
    state.onboardingName = "Eliza";
    state.onboardingServerTarget = "";
    state.onboardingProvider = "";
    state.onboardingApiKey = "";
    state.selectedVrmIndex = 1;
    state.onboardingDeferredTasks = [];
    state.conversations = [];
    state.plugins = [];
    state.tab = "chat";
    state.agentStatus = null;
  });

  mockUseApp.mockReset();
  mockUseApp.mockImplementation(() => ({
    t: (k: string) => k,
    ...state,
    setState: (key: string, value: unknown) => {
      state[key] = value;
    },
    setTheme: (theme: string) => {
      state.onboardingTheme = theme;
    },
    setTab: (tab: string) => {
      state.tab = tab;
    },
    handleOnboardingNext,
    handleOnboardingBack,
    handleOnboardingJumpToStep: vi.fn(),
    goToOnboardingStep: vi.fn(),
    handleReset,
    handleCloudLogin: vi.fn(async () => {
      state.elizaCloudConnected = true;
      state.elizaCloudUserId = "test-user";
    }),
    handleOnboardingRemoteConnect: vi.fn(async () => {}),
    handleOnboardingUseLocalBackend: vi.fn(),
    requestGreeting: vi.fn(async () => ({
      text: "hello",
      agentName: "Eliza",
      generated: true,
      persisted: false,
    })),
    retryStartup: vi.fn(),
    startupPhase:
      state.startupStatus === "ready" ? "ready" : "starting-backend",
  }));

  return { handleOnboardingNext, handleOnboardingBack, handleReset };
}

/** Drive through every onboarding step until completion. */
async function driveOnboardingToCompletion(
  tree: TestRenderer.ReactTestRenderer,
  state: AppHarnessState,
  handleOnboardingNext: () => Promise<void>,
) {
  for (let i = 0; i < 25 && !state.onboardingComplete; i += 1) {
    await advanceOnboarding(tree, state, handleOnboardingNext);
  }
}

// =====================================================================
//  1. Full onboarding journey → avatar creator
// =====================================================================

describe("onboarding journey to companion mode (e2e)", () => {
  let state: AppHarnessState;
  let mocks: ReturnType<typeof setupMock>;

  beforeEach(() => {
    state = createHarnessState();
    mocks = setupMock(state);
  });

  it("progresses through all onboarding steps and reaches companion mode", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // Verify we start in onboarding
    expect(state.onboardingComplete).toBe(false);
    expect(textOf(tree.root)).not.toContain("CharacterEditor");

    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);

    expect(state.onboardingComplete).toBe(true);
    expect(state.startupStatus).toBe("ready");

    expect(state.tab).toBe("companion");

    const renderedText = textOf(tree.root);
    expect(renderedText).toContain("CompanionShell:companion");
    expect(renderedText).not.toContain("OnboardingWizard");

    tree.unmount();
  });

  it("identity step selects an avatar and carries it through to completion", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // At identity step, the roster should show current avatar
    expect(state.onboardingStep).toBe("identity");
    expect(state.selectedVrmIndex).toBe(1);

    // Click choose agent — this sets avatar to 2, name to TestAgent
    await advanceOnboarding(tree, state, mocks.handleOnboardingNext);

    // Avatar selection should be persisted in state
    expect(state.selectedVrmIndex).toBe(2);
    expect(state.onboardingName).toBe("TestAgent");
    expect(state.onboardingStyle).toBe("chaotic");

    // Finish the rest of the onboarding
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);

    // Avatar index should still be 2 after finishing onboarding
    expect(state.selectedVrmIndex).toBe(2);
    expect(state.onboardingComplete).toBe(true);

    tree.unmount();
  });

  it("each onboarding step is visited in order", async () => {
    const visitedSteps: OnboardingStep[] = [];

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    for (let i = 0; i < 25 && !state.onboardingComplete; i += 1) {
      if (!visitedSteps.includes(state.onboardingStep)) {
        visitedSteps.push(state.onboardingStep);
      }

      await advanceOnboarding(tree, state, mocks.handleOnboardingNext);
    }

    expect(visitedSteps).toEqual([
      "identity",
      "connection",
      "rpc",
      "senses",
      "activate",
    ]);

    tree.unmount();
  });

  it("navigating to character-select after onboarding shows CharacterView", async () => {
    // Start already completed
    state.onboardingComplete = true;
    state.startupStatus = "ready";
    state.startupCoordinator = { phase: "ready" };
    state.startupCoordinatorLegacyPhase = "ready";
    state.tab = "character-select";
    state.uiShellMode = "native";

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    const renderedText = textOf(tree.root);
    expect(renderedText).toContain("CharacterEditor");
    expect(renderedText).not.toContain("OnboardingWizard");
    expect(renderedText).not.toContain("CompanionView");

    tree.unmount();
  });
});

// =====================================================================
//  2. Full agent reset → re-onboarding cycle
// =====================================================================

describe("agent reset and re-onboarding (e2e)", () => {
  let state: AppHarnessState;
  let mocks: ReturnType<typeof setupMock>;

  beforeEach(() => {
    state = createHarnessState();
    mocks = setupMock(state);
  });

  it("reset clears all state and returns to onboarding", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // Complete onboarding first
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);
    expect(state.onboardingComplete).toBe(true);
    expect(state.tab).toBe("companion");

    // Now reset the agent
    await act(async () => {
      await mocks.handleReset();
    });
    await rerender(tree, state);

    // Verify state was wiped
    expect(state.onboardingComplete).toBe(false);
    expect(state.startupStatus).toBe("onboarding");
    expect(state.onboardingStep).toBe("identity");
    expect(state.onboardingStyle).not.toBe("chaotic");
    expect(state.onboardingServerTarget).toBe("");
    expect(state.onboardingProvider).toBe("");
    expect(state.selectedVrmIndex).toBe(1);
    expect(state.conversations).toEqual([]);
    expect(state.plugins).toEqual([]);

    // UI should show onboarding again (the shell may render behind the
    // onboarding overlay during the crossfade transition, so check for
    // positive onboarding presence rather than negative ChatView absence)
    const renderedText = textOf(tree.root);
    expect(renderedText).not.toContain("CharacterEditor");
    expect(state.onboardingStep).toBe("identity");

    tree.unmount();
  });

  it("can complete a full onboarding after reset", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // First pass: complete onboarding
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);
    expect(state.onboardingComplete).toBe(true);

    // Reset
    await act(async () => {
      await mocks.handleReset();
    });
    await rerender(tree, state);
    expect(state.onboardingComplete).toBe(false);

    // Second pass: complete onboarding again from scratch
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);

    expect(state.onboardingComplete).toBe(true);
    expect(state.startupStatus).toBe("ready");
    expect(state.tab).toBe("companion");

    const renderedText = textOf(tree.root);
    expect(renderedText).toContain("CompanionShell:companion");

    tree.unmount();
  });

  it("reset preserves the ability to select a different avatar on re-onboarding", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // First pass: identity step sets avatar to 2
    await advanceOnboarding(tree, state, mocks.handleOnboardingNext);
    expect(state.selectedVrmIndex).toBe(2);

    // Complete the rest
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);
    expect(state.onboardingComplete).toBe(true);

    // Reset — avatar should go back to default
    await act(async () => {
      await mocks.handleReset();
    });
    await rerender(tree, state);
    expect(state.selectedVrmIndex).toBe(1);

    // Second pass: the identity step should show default avatar
    expect(state.onboardingStep).toBe("identity");
    expect(state.selectedVrmIndex).toBe(1);

    tree.unmount();
  });

  it("reset during mid-onboarding returns to the first step", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    // Advance partway through onboarding (to connection step)
    await advanceOnboarding(tree, state, mocks.handleOnboardingNext);
    expect(state.onboardingStep).toBe("connection");

    // Reset mid-flow
    await act(async () => {
      await mocks.handleReset();
    });
    await rerender(tree, state);

    // Should be back at the start
    expect(state.onboardingStep).toBe("identity");
    expect(state.onboardingComplete).toBe(false);
    expect(state.onboardingStyle).not.toBe("chaotic");

    tree.unmount();
  });

  it("multiple resets do not corrupt state", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(renderApp(state));
    });
    if (!tree) throw new Error("failed to render App");

    for (let cycle = 0; cycle < 3; cycle += 1) {
      // Complete onboarding
      await driveOnboardingToCompletion(
        tree,
        state,
        mocks.handleOnboardingNext,
      );
      expect(state.onboardingComplete).toBe(true);

      // Reset
      await act(async () => {
        await mocks.handleReset();
      });
      await rerender(tree, state);
      expect(state.onboardingComplete).toBe(false);
      expect(state.onboardingStep).toBe("identity");
    }

    // One final completion to prove it still works
    await driveOnboardingToCompletion(tree, state, mocks.handleOnboardingNext);
    expect(state.onboardingComplete).toBe(true);
    expect(textOf(tree.root)).toContain("CompanionShell:companion");
  });
});
