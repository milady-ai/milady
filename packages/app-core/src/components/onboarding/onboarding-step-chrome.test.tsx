// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  OnboardingLinkActionButton,
  OnboardingSecondaryActionButton,
  OnboardingStepHeader,
  onboardingHeaderBlockClass,
} from "./onboarding-step-chrome";

describe("onboarding step chrome actions", () => {
  it("uses onboarding-owned chrome for secondary actions instead of theme ghost styles", () => {
    render(
      <OnboardingSecondaryActionButton>Back</OnboardingSecondaryActionButton>,
    );

    const button = screen.getByRole("button", { name: "Back" });
    expect(button.className).toContain("min-h-[44px]");
    expect(button.className).toContain("min-w-[44px]");
    expect(button.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(button.className).toContain(
      "focus-visible:ring-[var(--onboarding-secondary-focus-ring)]",
    );
    expect(button.className).toContain(
      "[text-shadow:var(--onboarding-text-shadow-muted)]",
    );
    expect(button.className).not.toContain("-webkit-text-stroke");
    expect(button.className).not.toContain("bg-bg-accent");
    expect(button.className).not.toContain("text-muted-strong");
  });

  it("keeps onboarding link actions on onboarding-owned interaction tokens", () => {
    render(
      <OnboardingLinkActionButton>Report issue</OnboardingLinkActionButton>,
    );

    const button = screen.getByRole("button", { name: "Report issue" });
    expect(button.className).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(button.className).toContain("hover:text-[var(--onboarding-link)]");
    expect(button.className).toContain(
      "[text-shadow:var(--onboarding-text-shadow-muted)]",
    );
    expect(button.className).toContain("min-h-[44px]");
    expect(button.className).not.toContain("bg-bg-accent");
  });

  it("owns a shared bottom rhythm for onboarding headers", () => {
    const { container } = render(
      <OnboardingStepHeader
        eyebrow="Hosting"
        title="Choose your AI provider"
        description="Pick a provider to continue."
      />,
    );

    expect(container.firstElementChild).toBeTruthy();
    expect(String(container.firstElementChild?.className)).toContain(
      onboardingHeaderBlockClass,
    );
  });

  it("renders the onboarding title as a semantic level-one heading", () => {
    const { container } = render(
      <OnboardingStepHeader
        eyebrow="Hosting"
        title="Choose your AI provider"
        description="Pick a provider to continue."
      />,
    );

    const heading = within(container).getByRole("heading", {
      level: 1,
      name: "Choose your AI provider",
    });
    expect(heading).toBeTruthy();
  });

  it("promotes description-only prompts into the semantic heading slot", () => {
    const { container } = render(
      <OnboardingStepHeader
        eyebrow="Welcome to Milady"
        description="Existing setup detected. Continue, or start fresh?"
      />,
    );

    const heading = within(container).getByRole("heading", {
      level: 1,
      name: "Existing setup detected. Continue, or start fresh?",
    });
    expect(heading).toBeTruthy();
  });
});
