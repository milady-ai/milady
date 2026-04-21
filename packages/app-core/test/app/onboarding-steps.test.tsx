/**
 * Tests for the onboarding step components:
 * IdentityStep, ConnectionStep, ActivateStep
 *
 * Validates rendering, user interaction, and navigation callbacks.
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BOOT_CONFIG,
  setBootConfig,
} from "../../src/config/boot-config";

// ── Hoisted mock ──────────────────────────────────────────────────────
const { mockUseApp, mockIsNativeFn } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockIsNativeFn: { value: false },
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: (index: number) => `/vrms/preview-${index}.png`,
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    importAgent: vi.fn(),
    startAnthropicLogin: vi.fn(),
    exchangeAnthropicCode: vi.fn(),
    startOpenAILogin: vi.fn(),
    exchangeOpenAICode: vi.fn(),
  },
}));

vi.mock("@miladyai/app-core/providers", async () => {
  const actual = await vi.importActual<
    typeof import("@miladyai/app-core/providers")
  >("@miladyai/app-core/providers");
  return {
    ...actual,
    getProviderLogo: () => "/logos/placeholder.png",
  };
});

vi.mock("@miladyai/app-core/platform", () => ({
  get isNative() {
    return mockIsNativeFn.value;
  },
  isWebPlatform: () => false,
  isDesktopPlatform: () => true,
  isIOS: false,
  isAndroid: false,
  platform: "web",
}));

vi.mock("../../src/components/onboarding/onboarding-step-chrome", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/components/onboarding/onboarding-step-chrome")
  >("../../src/components/onboarding/onboarding-step-chrome");
  return {
    ...actual,
    spawnOnboardingRipple: vi.fn(),
  };
});

import { ActivateStep } from "../../src/components/onboarding/ActivateStep";
import { ConnectionStep } from "../../src/components/onboarding/ConnectionStep";
import { IdentityStep } from "../../src/components/onboarding/IdentityStep";
import { onboardingHeaderBlockClass } from "../../src/components/onboarding/onboarding-step-chrome";

function translateTest(
  key: string,
  vars?: {
    defaultValue?: string;
  },
): string {
  return vars?.defaultValue ?? key;
}

// ── Helpers ───────────────────────────────────────────────────────────

function baseContext(overrides?: Record<string, unknown>) {
  return {
    t: translateTest,
    onboardingStep: "wakeUp",
    onboardingOptions: {
      names: ["Eliza", "Nova"],
      styles: [{ catchphrase: "default" }],
      cloudProviders: [],
      providers: [
        { id: "openai", name: "OpenAI", description: "GPT API" },
        { id: "anthropic", name: "Anthropic", description: "Claude API" },
      ],
      models: { small: [], large: [] },
      openrouterModels: [],
      piAiModels: [],
      piAiDefaultModel: "",
    },
    onboardingName: "Eliza",
    onboardingOwnerName: "anon",
    onboardingStyle: "default",
    onboardingServerTarget: "",
    onboardingCloudApiKey: "",
    onboardingSmallModel: "",
    onboardingLargeModel: "",
    onboardingProvider: "",
    onboardingApiKey: "",
    onboardingRemoteApiBase: "",
    onboardingRemoteToken: "",
    onboardingRemoteConnecting: false,
    onboardingRemoteError: "",
    onboardingRemoteConnected: false,
    onboardingOpenRouterModel: "",
    onboardingPrimaryModel: "",
    onboardingSubscriptionTab: "token" as const,
    onboardingElizaCloudTab: "login" as const,
    onboardingSelectedChains: new Set<string>(),
    onboardingRpcSelections: {},
    onboardingRpcKeys: {},
    onboardingAvatar: 1,
    customVrmUrl: "",
    onboardingRestarting: false,
    uiLanguage: "en",
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    handleOnboardingNext: vi.fn(async () => {}),
    handleOnboardingBack: vi.fn(),
    handleOnboardingJumpToStep: vi.fn(),
    goToOnboardingStep: vi.fn(),
    handleOnboardingRemoteConnect: vi.fn(async () => {}),
    handleOnboardingUseLocalBackend: vi.fn(),
    handleCloudLogin: vi.fn(async () => {}),
    setState: vi.fn(),
    ...overrides,
  };
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

function findButtons(
  root: TestRenderer.ReactTestInstance,
): TestRenderer.ReactTestInstance[] {
  return root.findAllByType("button");
}

function makeButtonClickEvent() {
  return {
    currentTarget: null,
    clientX: 0,
    clientY: 0,
  };
}

// ===================================================================
//  IdentityStep
// ===================================================================

describe("IdentityStep", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    setBootConfig(DEFAULT_BOOT_CONFIG);
  });

  it("renders character select roster with preset characters", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingStep: "identity" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    // Should show character names from FRONTEND_PRESETS
    expect(text).toContain("Chen");
    expect(text).toContain("Continue");
  });

  it("calls handleOnboardingNext when Continue is clicked", async () => {
    const next = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      baseContext({ onboardingStep: "identity", handleOnboardingNext: next }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const continueBtn = buttons.find((b) => collectText(b) === "Continue");
    expect(continueBtn).toBeDefined();
    await act(async () => {
      continueBtn?.props.onClick();
    });
    expect(next).toHaveBeenCalled();
  });


});

// ===================================================================
//  ConnectionStep
// ===================================================================

describe("ConnectionStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders hosting selection before provider setup", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingProvider: "" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("onboarding.hostingTitle");
    expect(text).toContain("onboarding.hostingQuestion");
    expect(text).toContain("onboarding.hostingLocal");
    expect(text).toContain("header.Cloud");
    expect(text).toContain("onboarding.back");

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const headerBlock = (tree?.root as TestRenderer.ReactTestInstance).findAll(
      (node) =>
        node.type === "header" &&
        String(node.props.className ?? "").includes(onboardingHeaderBlockClass),
    )[0];
    expect(headerBlock).toBeDefined();

    const remoteButton = buttons.find((button) =>
      collectText(button).includes("onboarding.hostingRemote"),
    );
    expect(remoteButton).toBeDefined();
    expect(String(remoteButton?.props.className)).toContain(
      "bg-[var(--onboarding-card-bg)]",
    );
    expect(String(remoteButton?.props.className)).toContain(
      "var(--onboarding-card-shadow)",
    );
  });

  it("calls handleOnboardingBack from hosting selection", async () => {
    const back = vi.fn();
    mockUseApp.mockReturnValue(
      baseContext({ onboardingProvider: "", handleOnboardingBack: back }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const backBtn = buttons.find((b) =>
      collectText(b).includes("onboarding.back"),
    );
    expect(backBtn).toBeDefined();
    await act(async () => {
      backBtn?.props.onClick();
    });
    expect(back).toHaveBeenCalled();
  });

  it("renders provider selection grid once local hosting is chosen", async () => {
    mockUseApp.mockReturnValue(
      baseContext({
        onboardingServerTarget: "local",
        onboardingProvider: "",
      }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("onboarding.neuralLinkTitle");
    expect(text).toContain("onboarding.chooseProvider");
  });

  it("renders provider config when a provider is selected", async () => {
    mockUseApp.mockReturnValue(
      baseContext({
        onboardingServerTarget: "local",
        onboardingProvider: "openai",
      }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    // Should show provider name and back/confirm buttons
    expect(text).toContain("OpenAI");
    expect(text).toContain("onboarding.back");
  });

  it("renders remote backend fields for self-hosted cloud connections", async () => {
    mockUseApp.mockReturnValue(
      baseContext({
        onboardingServerTarget: "remote",
      }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("onboarding.remoteTitle");
    expect(text).toContain("onboarding.remoteAddress");
    expect(text).toContain("onboarding.remoteAccessKey");
    expect(text).toContain("onboarding.remoteConnect");
  });

  it("shows only cloud hosting on mobile (isNative = true)", async () => {
    mockIsNativeFn.value = true;
    mockUseApp.mockReturnValue(
      baseContext({
        onboardingProvider: "",
        onboardingOptions: {
          names: ["Eliza"],
          styles: [{ catchphrase: "default" }],
          cloudProviders: [],
          providers: [
            { id: "elizacloud", name: "Eliza Cloud", description: "Free" },
            { id: "openai", name: "OpenAI", description: "GPT API" },
            { id: "anthropic", name: "Anthropic", description: "Claude API" },
          ],
          models: { small: [], large: [] },
          openrouterModels: [],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("header.Cloud");
    expect(text).not.toContain("onboarding.hostingLocal");
    mockIsNativeFn.value = false;
  });
});

// ===================================================================
//  ActivateStep
// ===================================================================

describe("ActivateStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders ready screen with agent name", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingName: "Nova" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("onboarding.readyTitle");
    expect(text).toContain("onboarding.companionReady");
    expect(text).toContain("onboarding.enter");
  });

  it("calls handleOnboardingNext when Enter is clicked", async () => {
    const next = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      baseContext({ onboardingName: "Nova", handleOnboardingNext: next }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const enterBtn = buttons.find((b) => collectText(b) === "onboarding.enter");
    expect(enterBtn).toBeDefined();
    await act(async () => {
      enterBtn?.props.onClick();
    });
    expect(next).toHaveBeenCalled();
  });

  it("shows fallback name when onboardingName is empty", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingName: "" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("onboarding.companionReady");
  });
});
