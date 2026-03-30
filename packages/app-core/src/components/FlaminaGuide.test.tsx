// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../test/helpers/react-test";
import { FlaminaGuideCard } from "./FlaminaGuide";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

beforeEach(() => {
  mockUseApp.mockReturnValue({ t: (k: string) => k });
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
