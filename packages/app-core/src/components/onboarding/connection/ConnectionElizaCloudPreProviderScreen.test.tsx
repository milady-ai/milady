// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockUseBranding } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(() => ({ bugReportUrl: "https://example.invalid" })),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../config", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../../utils", () => ({
  openExternalUrl: vi.fn(async () => {}),
}));

vi.mock("./useAdvanceOnboardingWhenElizaCloudOAuthConnected", () => ({
  useAdvanceOnboardingWhenElizaCloudOAuthConnected: () => undefined,
}));

import { ConnectionElizaCloudPreProviderScreen } from "./ConnectionElizaCloudPreProviderScreen";

function t(key: string): string {
  const translations: Record<string, string> = {
    "onboarding.connected": "Connected",
    "onboarding.login": "Login",
    "onboarding.apiKey": "API Key",
    "onboarding.freeCredits": "Free credits included.",
    "onboarding.cloudProviderBehaviorHint":
      "Milady may restart after provider changes.",
    "onboarding.confirm": "Confirm",
    "onboarding.back": "Back",
  };

  return translations[key] ?? key;
}

describe("ConnectionElizaCloudPreProviderScreen", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseBranding.mockReset().mockReturnValue({
      bugReportUrl: "https://example.invalid",
    });
  });

  it("uses the compact success banner layout once Eliza Cloud is connected", () => {
    mockUseApp.mockReturnValue({
      t,
      onboardingCloudApiKey: "",
      onboardingApiKey: "",
      onboardingElizaCloudTab: "login",
      onboardingRunMode: "local",
      onboardingCloudProvider: "",
      elizaCloudConnected: true,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: "",
      handleCloudLogin: vi.fn(),
      handleOnboardingNext: vi.fn(),
      setState: vi.fn(),
    });

    render(<ConnectionElizaCloudPreProviderScreen dispatch={vi.fn()} />);

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-onboarding-status-layout")).toBe(
      "compact",
    );
    const content = banner.querySelector("[data-onboarding-status-content]");
    expect(content?.textContent).toContain("Connected");
  });
});
