// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@miladyai/app-core/bridge", () => ({
  invokeDesktopBridgeRequest: vi.fn(),
  isElectrobunRuntime: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: vi.fn(() => ({
    onboardingLoading: false,
    onboardingStep: "identity",
  })),
  CUSTOM_ONBOARDING_STEPS: [],
}));

import { DesktopOnboardingRuntime } from "@miladyai/app-core/shell";

describe("DesktopOnboardingRuntime", () => {
  it("renders null (no-op placeholder)", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(DesktopOnboardingRuntime));
    });

    expect(tree!.toJSON()).toBeNull();

    await act(async () => {
      tree?.unmount();
    });
  });
});
