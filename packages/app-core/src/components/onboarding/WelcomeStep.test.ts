// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppMock, useBrandingMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
  useBrandingMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/config", () => ({
  useBranding: () => useBrandingMock(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => useAppMock(),
}));

import { WelcomeStep } from "./WelcomeStep";

describe("WelcomeStep", () => {
  beforeEach(() => {
    useBrandingMock.mockReset().mockReturnValue({ appName: "Milady" });
    useAppMock.mockReset();
  });

  it("offers a local existing-setup check on first run", async () => {
    const handleOnboardingUseLocalBackend = vi.fn();
    const setState = vi.fn();
    useAppMock.mockReturnValue({
      onboardingExistingInstallDetected: false,
      handleOnboardingUseLocalBackend,
      setState,
      t: (key: string) => key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(WelcomeStep));
    });

    if (!renderer) {
      throw new Error("WelcomeStep did not render");
    }

    const buttons = renderer.root.findAllByType("button");
    expect(buttons[0]?.children).toContain("onboarding.checkExistingSetup");
    expect(buttons[1]?.children).toContain("onboarding.getStarted");

    await act(async () => {
      buttons[0]?.props.onClick();
    });
    expect(handleOnboardingUseLocalBackend).toHaveBeenCalledTimes(1);

    await act(async () => {
      buttons[1]?.props.onClick();
    });
    expect(setState).toHaveBeenCalledWith(
      "onboardingStyle",
      "I'm here to help you.",
    );
    expect(setState).toHaveBeenCalledWith("onboardingName", "Chen");
    expect(setState).toHaveBeenCalledWith("selectedVrmIndex", 1);
    expect(setState).toHaveBeenCalledWith("onboardingStep", "connection");
  });

  it("lets users continue with an already detected setup without resetting onboarding", async () => {
    const handleOnboardingUseLocalBackend = vi.fn();
    const setState = vi.fn();
    useAppMock.mockReturnValue({
      onboardingExistingInstallDetected: true,
      handleOnboardingUseLocalBackend,
      setState,
      t: (key: string) => key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(WelcomeStep));
    });

    if (!renderer) {
      throw new Error("WelcomeStep did not render");
    }

    const buttons = renderer.root.findAllByType("button");
    expect(buttons[0]?.children).toContain("onboarding.customSetup");
    expect(buttons[1]?.children).toContain("onboarding.useExistingSetup");

    await act(async () => {
      buttons[1]?.props.onClick();
    });

    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledWith("onboardingStep", "connection");
    expect(handleOnboardingUseLocalBackend).not.toHaveBeenCalled();
  });
});
