// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => ({
    onboardingStep: "hosting",
    handleOnboardingJumpToStep: vi.fn(),
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}(${JSON.stringify(params)})`;
      return key;
    },
  }),
}));

vi.mock("@miladyai/ui", () => ({
  Button: (props: Record<string, unknown>) =>
    React.createElement("button", props, props.children as React.ReactNode),
}));

vi.mock("../../../config/branding", () => ({
  useBranding: () => ({ cloudOnly: false }),
}));

vi.mock("../../../onboarding/flow", () => ({
  getOnboardingNavMetas: () => [
    {
      id: "welcome",
      name: "onboarding.stepName.welcome",
      subtitle: "onboarding.stepSub.welcome",
    },
    {
      id: "hosting",
      name: "onboarding.stepName.hosting",
      subtitle: "onboarding.stepSub.hosting",
    },
    {
      id: "activate",
      name: "onboarding.stepName.activate",
      subtitle: "onboarding.stepSub.activate",
    },
  ],
}));

import { OnboardingStepNav } from "../onboarding/OnboardingStepNav";

describe("OnboardingStepNav accessibility", () => {
  it("renders a container with role=list and aria-label", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });
    const lists = tree?.root.findAll(
      (node) => node.props.role === "list" && node.props["aria-label"],
    );
    expect(lists?.length).toBeGreaterThanOrEqual(1);
  });

  it("renders listitem roles for non-clickable steps", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });
    // "hosting" is current (index=1), "welcome" is done (clickable → Button),
    // "hosting" and "activate" are non-clickable → role=listitem
    const items = tree?.root.findAll((node) => node.props.role === "listitem");
    expect(items?.length).toBeGreaterThanOrEqual(2); // hosting (active) + activate (future)
  });

  it("marks the active step with aria-current=step", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });
    const current = tree?.root.findAll(
      (node) => node.props["aria-current"] === "step",
    );
    expect(current?.length).toBe(1);
  });

  it("marks dot elements as aria-hidden", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });
    const hiddenDots = tree?.root.findAll(
      (node) => node.props["aria-hidden"] === "true",
    );
    // One aria-hidden dot per step (3 total)
    expect(hiddenDots?.length).toBeGreaterThanOrEqual(3);
  });

  it("completed steps have aria-label on the button", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<OnboardingStepNav />);
    });
    // "welcome" is done (index 0 < currentIndex 1) → renders as Button
    const buttons = tree?.root.findAll(
      (node) => node.type === "button" && node.props["aria-label"],
    );
    expect(buttons?.length).toBeGreaterThanOrEqual(1);
    // Label should contain the step name and "completed"
    expect(buttons?.[0].props["aria-label"]).toContain(
      "onboarding.stepName.welcome",
    );
    expect(buttons?.[0].props["aria-label"]).toContain("onboarding.completed");
  });
});
