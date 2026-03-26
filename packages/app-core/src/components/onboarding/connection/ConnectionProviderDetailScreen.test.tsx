// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    "onboarding.enterApiKey": "Enter API key",
    "onboarding.back": "Back",
    "onboarding.confirm": "Confirm",
    "onboarding.login": "Login",
    "onboarding.useExistingKey": "Use an existing key.",
    "onboarding.getOneHere": "Get one here",
    "onboarding.freeCredits": "Free credits included.",
    "onboarding.selectModel": "Select model",
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

describe("ConnectionProviderDetailScreen", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseBranding.mockImplementation(() => ({}));
    mockOpenExternalUrl.mockReset();
    mockGetProviderLogo.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders labeled API key entry and confirmation affordances", () => {
    mockUseApp.mockReturnValue(createState());

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByLabelText("API Key")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
  });

  it("renders an actionable browser-login recovery control for Eliza Cloud", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        elizaCloudLoginError:
          "Open this link to log in: https://example.com/login",
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open login page in browser" }),
    );

    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://example.com/login",
    );
  });

  it("exposes openrouter model choices as a radiogroup", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "openrouter",
        onboardingApiKey: "sk-test-12345678901234567890",
        onboardingOpenRouterModel: "mixtral",
        onboardingOptions: {
          providers: [
            { id: "openrouter", name: "OpenRouter", description: "Many models" },
          ],
          openrouterModels: [
            { id: "mixtral", name: "Mixtral", description: "Fast model" },
            { id: "sonnet", name: "Claude Sonnet", description: "Balanced model" },
          ],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Select model" })).toBeTruthy();
    const selectedModel = screen.getByRole("radio", { name: /Mixtral/i });
    expect(selectedModel).toBeTruthy();
    expect(selectedModel.getAttribute("aria-checked")).toBe("true");
  });
});
