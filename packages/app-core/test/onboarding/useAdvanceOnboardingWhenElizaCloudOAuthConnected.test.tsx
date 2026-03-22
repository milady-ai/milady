/**
 * @vitest-environment jsdom
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdvanceOnboardingWhenElizaCloudOAuthConnected } from "../../src/components/onboarding/connection/useAdvanceOnboardingWhenElizaCloudOAuthConnected";

function Harness(props: {
  active: boolean;
  elizaCloudConnected: boolean;
  elizaCloudTab: "login" | "apikey";
  handleOnboardingNext: () => void | Promise<void>;
}) {
  useAdvanceOnboardingWhenElizaCloudOAuthConnected(props);
  return null;
}

describe("useAdvanceOnboardingWhenElizaCloudOAuthConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls handleOnboardingNext once when OAuth connects on the login tab", async () => {
    const handleOnboardingNext = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <Harness
          active
          elizaCloudConnected={false}
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    expect(handleOnboardingNext).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <Harness
          active
          elizaCloudConnected
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    expect(handleOnboardingNext).toHaveBeenCalledTimes(1);
  });

  it("does not advance on the API key tab even when connected", async () => {
    const handleOnboardingNext = vi.fn();

    await act(async () => {
      TestRenderer.create(
        <Harness
          active
          elizaCloudConnected
          elizaCloudTab="apikey"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    expect(handleOnboardingNext).not.toHaveBeenCalled();
  });

  it("does not advance when inactive", async () => {
    const handleOnboardingNext = vi.fn();

    await act(async () => {
      TestRenderer.create(
        <Harness
          active={false}
          elizaCloudConnected
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    expect(handleOnboardingNext).not.toHaveBeenCalled();
  });

  it("can advance again after disconnect then reconnect on the same mount", async () => {
    const handleOnboardingNext = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <Harness
          active
          elizaCloudConnected
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });
    expect(handleOnboardingNext).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(
        <Harness
          active
          elizaCloudConnected={false}
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    await act(async () => {
      renderer.update(
        <Harness
          active
          elizaCloudConnected
          elizaCloudTab="login"
          handleOnboardingNext={handleOnboardingNext}
        />,
      );
    });

    expect(handleOnboardingNext).toHaveBeenCalledTimes(2);
  });
});
