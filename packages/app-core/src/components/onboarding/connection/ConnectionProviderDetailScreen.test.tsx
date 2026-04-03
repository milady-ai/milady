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
    "onboarding.connected": "Connected",
    "onboarding.confirm": "Confirm",
    "onboarding.connectAccount": "Connect account",
    "onboarding.connecting": "Connecting",
    "onboarding.login": "Login",
    "onboarding.openLoginPageInBrowser": "Open login page in browser",
    "onboarding.openLoginPageInBrowserDesc":
      "Open the login page in your browser to continue.",
    "onboarding.reportIssue": "Report issue",
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
    onboardingCloudApiKey: "",
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
    const apiKeyInput = screen.getByLabelText("API Key");
    expect(apiKeyInput).toBeTruthy();
    expect(apiKeyInput.className).toContain("bg-[var(--onboarding-input-bg)]");
    expect(apiKeyInput.className).not.toContain("-webkit-text-stroke");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    const backButton = screen.getByRole("button", { name: "Back" });
    expect(backButton.className).toContain("min-h-[44px]");
    expect(backButton.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(backButton.className).not.toContain("bg-bg-accent");
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

  it("shows report-issue action for non-link cloud login errors", async () => {
    mockUseBranding.mockImplementation(() => ({
      bugReportUrl: "https://example.invalid",
    }));
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        elizaCloudLoginError: "Login failed unexpectedly",
      }),
    );

    const { getByRole } = render(
      <ConnectionProviderDetailScreen dispatch={vi.fn()} />,
    );

    const reportIssueButton = getByRole("button", { name: "Report issue" });

    expect(reportIssueButton).toBeDefined();

    fireEvent.click(reportIssueButton);
    expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://example.invalid");
  });

  it("uses the compact success banner for the Eliza Cloud connected state", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "elizacloud",
        onboardingElizaCloudTab: "login",
        elizaCloudConnected: true,
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-onboarding-status-layout")).toBe(
      "compact",
    );
    const content = banner.querySelector("[data-onboarding-status-content]");
    expect(content?.textContent).toContain("Connected");
  });

  it("exposes openrouter model choices as a radiogroup", () => {
    mockUseApp.mockReturnValue(
      createState({
        onboardingProvider: "openrouter",
        onboardingApiKey: "sk-test-12345678901234567890",
        onboardingOpenRouterModel: "mixtral",
        onboardingOptions: {
          providers: [
            {
              id: "openrouter",
              name: "OpenRouter",
              description: "Many models",
            },
          ],
          openrouterModels: [
            { id: "mixtral", name: "Mixtral", description: "Fast model" },
            {
              id: "sonnet",
              name: "Claude Sonnet",
              description: "Balanced model",
            },
          ],
          piAiModels: [],
          piAiDefaultModel: "",
        },
      }),
    );

    render(<ConnectionProviderDetailScreen dispatch={vi.fn()} />);

    expect(
      screen.getByRole("radiogroup", { name: "Select model" }),
    ).toBeTruthy();
    const selectedModel = screen.getByRole("radio", { name: /Mixtral/i });
    expect(selectedModel).toBeTruthy();
    expect(selectedModel.getAttribute("aria-checked")).toBe("true");
  });
});
