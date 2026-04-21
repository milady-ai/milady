// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../test/helpers/react-test";
import { DeferredSetupChecklist, FlaminaGuideCard } from "./FlaminaGuide";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

beforeEach(() => {
  mockUseApp.mockReturnValue({
    t: (k: string, vars?: { defaultValue?: string }) => vars?.defaultValue ?? k,
    onboardingDeferredTasks: [],
    postOnboardingChecklistDismissed: false,
    setState: vi.fn(),
  });
});

describe("FlaminaGuideCard", () => {
  it("explains provider impact on character behavior", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "provider" }),
      );
    });

    const renderedText = textOf(tree?.root);

    expect(renderedText).toContain("flaminaguide.provider.whenToUse");
    expect(renderedText).toContain("flaminaguide.provider.characterImpact");
    expect(renderedText).toContain("flaminaguide.provider.description");
  });

  it("explains rpc impact on external capabilities", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "rpc" }),
      );
    });

    const renderedText = textOf(tree?.root);

    expect(renderedText).toContain("flaminaguide.rpc.characterImpact");
    expect(renderedText).toContain("flaminaguide.rpc.description");
    expect(renderedText).toContain("flaminaguide.rpc.whenToUse");
  });

  it("explains permissions impact on local access", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "permissions" }),
      );
    });

    const renderedText = textOf(tree?.root);

    expect(renderedText).toContain("flaminaguide.permissions.characterImpact");
    expect(renderedText).toContain("flaminaguide.permissions.description");
    expect(renderedText).toContain("flaminaguide.permissions.whenToUse");
  });

  it("explains voice impact on presentation", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(FlaminaGuideCard, { topic: "voice" }),
      );
    });

    const renderedText = textOf(tree?.root);

    expect(renderedText).toContain("flaminaguide.voice.characterImpact");
    expect(renderedText).toContain("flaminaguide.voice.description");
    expect(renderedText).toContain("flaminaguide.voice.whenToUse");
  });
});

describe("DeferredSetupChecklist", () => {
  it("renders provider deferred task copy", () => {
    mockUseApp.mockReturnValue({
      t: (k: string, vars?: { defaultValue?: string }) =>
        vars?.defaultValue ?? k,
      onboardingDeferredTasks: ["provider"],
      postOnboardingChecklistDismissed: false,
      setState: vi.fn(),
    });

    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(DeferredSetupChecklist, null),
      );
    });

    const renderedText = textOf(tree?.root);
    expect(renderedText).toContain("flaminaguide.tasks.provider.label");
    expect(renderedText).toContain("flaminaguide.tasks.provider.description");
  });

  it("opens the deferred task through the provided callback", () => {
    const onOpenTask = vi.fn();
    mockUseApp.mockReturnValue({
      t: (k: string, vars?: { defaultValue?: string }) =>
        vars?.defaultValue ?? k,
      onboardingDeferredTasks: ["provider"],
      postOnboardingChecklistDismissed: false,
      setState: vi.fn(),
    });

    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(DeferredSetupChecklist, { onOpenTask }),
      );
    });

    const openButton = tree.root.findAll(
      (node) =>
        node.type === "button" && textOf(node).includes("flaminaguide.Open"),
    )[0];

    act(() => {
      openButton.props.onClick();
    });

    expect(onOpenTask).toHaveBeenCalledWith("provider");
  });
});
