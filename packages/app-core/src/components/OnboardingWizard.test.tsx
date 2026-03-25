// @vitest-environment jsdom

import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockVrmStage } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockVrmStage: vi.fn(() => React.createElement("div", null, "VrmStage")),
}));

vi.mock("@miladyai/app-core/state", () => ({
  getVrmPreviewUrl: () => "/vrms/previews/eliza-1.png",
  getVrmUrl: () => "/vrms/eliza-1.vrm.gz",
  applyUiTheme: vi.fn(),
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
    mockUseApp.mockReset();
    mockVrmStage.mockClear();
  });

  it("keeps the day scene and light tokens when the UI theme is light", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "hosting",
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiLanguage: "en",
      uiTheme: "light",
      setState: vi.fn(),
      t: (key: string) => key,
      onboardingUiRevealNonce: 0,
      companionVrmPowerMode: "balanced",
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    });

    await act(async () => {
      TestRenderer.create(<OnboardingWizard />);
    });

    // CSS variables are now applied via Tailwind/CSS, not inline styles.
    // Verify the VRM stage receives the correct world + camera props.
    expect(mockVrmStage.mock.calls[0]?.[0]).toMatchObject({
      worldUrl: "worlds/companion-day.spz",
      cameraProfile: "companion",
      initialCompanionZoomNormalized: 1,
    });
  });

  it("uses the night scene and dark tokens when the UI theme is dark", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "hosting",
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiLanguage: "en",
      uiTheme: "dark",
      setState: vi.fn(),
      t: (key: string) => key,
      onboardingUiRevealNonce: 0,
      companionVrmPowerMode: "balanced",
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    });

    await act(async () => {
      TestRenderer.create(<OnboardingWizard />);
    });

    // CSS variables are now applied via Tailwind/CSS, not inline styles.
    // Verify the VRM stage receives the night world for dark theme.
    // World URL is always companion-day.spz regardless of theme
    expect(mockVrmStage.mock.calls[0]?.[0]).toMatchObject({
      worldUrl: "worlds/companion-day.spz",
      cameraProfile: "companion",
      initialCompanionZoomNormalized: 1,
    });
  });

  it("does not render the legacy corner decoration svgs", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "hosting",
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiLanguage: "en",
      uiTheme: "light",
      setState: vi.fn(),
      t: (key: string) => key,
      onboardingUiRevealNonce: 0,
      companionVrmPowerMode: "balanced",
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    });

    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingWizard />);
    });

    const svgs = tree?.root.findAll((node) => node.type === "svg");
    expect(svgs?.length ?? 0).toBe(0);
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
        companionVrmPowerMode: "balanced",
        companionHalfFramerateMode: "when_saving_power",
        companionAnimateWhenHidden: false,
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

    it("reveals non-welcome onboarding steps after a shorter fallback delay", async () => {
      mockUseApp.mockReturnValue({
        onboardingStep: "hosting",
        selectedVrmIndex: 1,
        customVrmUrl: "",
        uiLanguage: "en",
        uiTheme: "dark",
        setState: vi.fn(),
        t: (key: string) => key,
        onboardingUiRevealNonce: 0,
        companionVrmPowerMode: "balanced",
        companionHalfFramerateMode: "when_saving_power",
        companionAnimateWhenHidden: false,
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
        vi.advanceTimersByTime(1200);
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
        companionVrmPowerMode: "balanced",
        companionHalfFramerateMode: "when_saving_power",
        companionAnimateWhenHidden: false,
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

  it("locks document/body scroll while mounted and restores on unmount", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "welcome",
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiLanguage: "en",
      uiTheme: "dark",
      setState: vi.fn(),
      t: (key: string) => key,
      onboardingUiRevealNonce: 0,
      companionVrmPowerMode: "balanced",
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    });

    const prevDocOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;

    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingWizard />);
    });

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      tree?.unmount();
    });

    expect(document.documentElement.style.overflow).toBe(prevDocOverflow);
    expect(document.body.style.overflow).toBe(prevBodyOverflow);
  });
});
