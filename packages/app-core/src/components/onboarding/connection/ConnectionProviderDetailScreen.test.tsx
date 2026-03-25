// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockUseBranding,
  mockOpenExternalUrl,
  mockGetProviderLogo,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(() => ({})),
  mockOpenExternalUrl: vi.fn(async () => {}),
  mockGetProviderLogo: vi.fn(() => "logo://provider"),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../config", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("../../../providers", () => ({
  getProviderLogo: (...args: unknown[]) => mockGetProviderLogo(...args),
}));

vi.mock("./useAdvanceOnboardingWhenElizaCloudOAuthConnected", () => ({
  useAdvanceOnboardingWhenElizaCloudOAuthConnected: () => undefined,
}));

import { ConnectionProviderDetailScreen } from "./ConnectionProviderDetailScreen";

function t(key: string): string {
  const translations: Record<string, string> = {
    "onboarding.apiKey": "API Key",
    "onboarding.back": "Back",
    "onboarding.confirm": "Confirm",
    "onboarding.login": "Login",
    "onboarding.useExistingKey": "Use an existing key.",
    "onboarding.getOneHere": "Get one here",
    "onboarding.freeCredits": "Free credits included.",
  };
  return translations[key] ?? key;
}

function createState(overrides: Record<string, unknown> = {}) {
  return {
    onboardingOptions: {
      providers: [
        { id: "openai", name: "OpenAI", description: "GPT API" },
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "LLMs, RPCs & more included",
        },
      ],
      openrouterModels: [],
      piAiModels: [],
      piAiDefaultModel: "",
    },
    onboardingProvider: "openai",
    onboardingSubscriptionTab: "token",
    onboardingApiKey: "",
    onboardingPrimaryModel: "",
    onboardingElizaCloudTab: "login",
    onboardingOpenRouterModel: "",
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    handleCloudLogin: vi.fn(),
    handleOnboardingNext: vi.fn(async () => {}),
    setState: vi.fn(),
    t,
    ...overrides,
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : textOf(child as TestRenderer.ReactTestInstance),
    )
    .join("");
}

describe("ConnectionProviderDetailScreen", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseBranding.mockImplementation(() => ({}));
    mockOpenExternalUrl.mockReset();
    mockGetProviderLogo.mockClear();
  });

  it("renders provider header copy and confirmation affordances", async () => {
    mockUseApp.mockReturnValue(createState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <ConnectionProviderDetailScreen dispatch={vi.fn()} />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("OpenAI");
    expect(snapshot).toContain("GPT API key");
    expect(snapshot).toContain("API Key");
    expect(snapshot).toContain("Confirm");
  });

  it("renders an actionable browser-login recovery control for Eliza Cloud", async () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        elizaCloudLoginError:
          "Open this link to log in: https://example.com/login",
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <ConnectionProviderDetailScreen dispatch={vi.fn()} />,
      );
    });

    const linkButton = tree?.root
      .findAll((node) => typeof node.props?.onClick === "function")
      .find((node) => textOf(node).includes("Open login page in browser"));

    expect(linkButton).toBeDefined();

    await act(async () => {
      linkButton?.props.onClick();
    });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://example.com/login",
    );
  });
});
