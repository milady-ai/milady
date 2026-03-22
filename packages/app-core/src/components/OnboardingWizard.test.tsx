// @vitest-environment jsdom

import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockApplyUiTheme, mockUseApp, mockVrmStage } = vi.hoisted(() => ({
  mockApplyUiTheme: vi.fn(),
  mockUseApp: vi.fn(),
  mockVrmStage: vi.fn(() => React.createElement("div", null, "VrmStage")),
}));

vi.mock("@miladyai/app-core/state", () => ({
  applyUiTheme: (theme: "light" | "dark") => mockApplyUiTheme(theme),
  getVrmPreviewUrl: () => "/vrms/previews/eliza-1.png",
  getVrmUrl: () => "/vrms/eliza-1.vrm.gz",
  ONBOARDING_STEPS: [
    {
      id: "hosting",
      name: "onboarding.stepName.hosting",
      subtitle: "onboarding.stepSub.hosting",
    },
  ],
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/components", () => ({
  LanguageDropdown: () => React.createElement("div", null, "LanguageDropdown"),
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (path: string) => path,
}));

vi.mock("../config/branding", () => ({
  useBranding: () => ({
    appName: "Milady",
    orgName: "milady-ai",
    repoName: "milady",
    docsUrl: "https://example.invalid",
    appUrl: "https://example.invalid",
    bugReportUrl: "https://example.invalid",
    hashtag: "#MiladyAgent",
    fileExtension: ".milady-agent",
    packageScope: "miladyai",
  }),
}));

vi.mock("./companion/VrmStage", () => ({
  VrmStage: (props: unknown) => mockVrmStage(props),
}));

vi.mock("./onboarding/ActivateStep", () => ({
  ActivateStep: () => React.createElement("div", null, "ActivateStep"),
}));

vi.mock("./onboarding/ConnectionStep", () => ({
  ConnectionStep: () => React.createElement("div", null, "ConnectionStep"),
}));

vi.mock("./onboarding/OnboardingPanel", () => ({
  OnboardingPanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("./onboarding/OnboardingStepNav", () => ({
  OnboardingStepNav: () =>
    React.createElement("div", null, "OnboardingStepNav"),
}));

vi.mock("./onboarding/PermissionsStep", () => ({
  PermissionsStep: () => React.createElement("div", null, "PermissionsStep"),
}));

vi.mock("./onboarding/WelcomeStep", () => ({
  WelcomeStep: () => React.createElement("div", null, "WelcomeStep"),
}));

import { OnboardingWizard } from "./OnboardingWizard";

describe("OnboardingWizard", () => {
  beforeEach(() => {
    mockApplyUiTheme.mockReset();
    mockUseApp.mockReset();
    mockVrmStage.mockClear();
  });

  it("forces light chrome while keeping the onboarding world on the day scene", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "hosting",
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiLanguage: "en",
      uiTheme: "dark",
      setState: vi.fn(),
      t: (key: string) => key,
      onboardingUiRevealNonce: 0,
    });

    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingWizard />);
    });

    expect(mockApplyUiTheme).toHaveBeenCalledWith("light");
    expect(mockVrmStage.mock.calls[0]?.[0]).toMatchObject({
      worldUrl: "worlds/companion-day.spz",
      cameraProfile: "companion",
      initialCompanionZoomNormalized: 1,
    });

    await act(async () => {
      tree?.unmount();
    });

    expect(mockApplyUiTheme).toHaveBeenLastCalledWith("dark");
  });

  describe("onboarding overlay reveal fallback", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fades in the UI overlay when VrmStage never calls onRevealStart", async () => {
      mockUseApp.mockReturnValue({
        onboardingStep: "welcome",
        selectedVrmIndex: 1,
        customVrmUrl: "",
        uiLanguage: "en",
        uiTheme: "dark",
        setState: vi.fn(),
        t: (key: string) => key,
        onboardingUiRevealNonce: 0,
      });

      let tree: ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(<OnboardingWizard />);
      });

      const overlay = tree?.root.findByProps({
        "data-testid": "onboarding-ui-overlay",
      });
      expect(overlay?.props.style.opacity).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(3500);
      });

      expect(overlay?.props.style.opacity).toBe(1);

      await act(async () => {
        tree?.unmount();
      });
    });

    it("shows the overlay immediately when opening onboarding after agent reset", async () => {
      mockUseApp.mockReturnValue({
        onboardingStep: "welcome",
        selectedVrmIndex: 1,
        customVrmUrl: "",
        uiLanguage: "en",
        uiTheme: "dark",
        setState: vi.fn(),
        t: (key: string) => key,
        onboardingUiRevealNonce: 1,
      });

      let tree: ReactTestRenderer | undefined;
      await act(async () => {
        tree = TestRenderer.create(<OnboardingWizard />);
      });

      const overlay = tree?.root.findByProps({
        "data-testid": "onboarding-ui-overlay",
      });
      expect(overlay?.props.style.opacity).toBe(1);

      await act(async () => {
        tree?.unmount();
      });
    });
  });
});
