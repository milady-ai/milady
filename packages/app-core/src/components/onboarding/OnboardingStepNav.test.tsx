// @vitest-environment jsdom

import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { mockUseApp, mockUseBranding, mockGetOnboardingNavMetas } = vi.hoisted(
  () => ({
    mockUseApp: vi.fn(),
    mockUseBranding: vi.fn(),
    mockGetOnboardingNavMetas: vi.fn(),
  }),
);

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("../../config/branding", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../onboarding/flow", () => ({
  getOnboardingNavMetas: (...args: unknown[]) =>
    mockGetOnboardingNavMetas(...args),
}));

import { OnboardingStepNav } from "./OnboardingStepNav";

describe("OnboardingStepNav", () => {
  it("uses the compact mobile nav spacing that keeps the step rail lower", async () => {
    mockUseApp.mockReturnValue({
      onboardingStep: "hosting",
      handleOnboardingJumpToStep: vi.fn(),
      t: (key: string) => key,
    });
    mockUseBranding.mockReturnValue({ cloudOnly: false });
    mockGetOnboardingNavMetas.mockReturnValue([
      {
        id: "cloud_login",
        name: "onboarding.stepName.cloud",
        subtitle: "onboarding.stepSub.cloud",
      },
      {
        id: "hosting",
        name: "onboarding.stepName.hosting",
        subtitle: "onboarding.stepSub.hosting",
      },
      {
        id: "providers",
        name: "onboarding.stepName.providers",
        subtitle: "onboarding.stepSub.providers",
      },
    ]);

    let tree: ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });

    const outerShell = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("absolute left-0 top-0 bottom-0 z-10"),
    );
    const navSurface = tree?.root.find(
      (node) =>
        typeof node.props.className === "string" &&
        node.props.className.includes("w-full relative isolate rounded-[28px]"),
    );

    expect(String(outerShell?.props.className)).toContain("max-md:-mb-12");
    expect(String(outerShell?.props.className)).toContain("max-md:pb-1");
    expect(String(outerShell?.props.className)).toContain("max-md:pt-1");
    expect(String(navSurface?.props.className)).toContain("max-md:px-2.5");
    expect(String(navSurface?.props.className)).toContain("max-md:py-2");
  });
});
