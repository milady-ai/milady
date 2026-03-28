// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockUseBranding } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(() => ({ appName: "Milady" })),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../config", () => ({
  appNameInterpolationVars: () => ({ appName: "Milady" }),
  useBranding: () => mockUseBranding(),
}));

vi.mock("../../../providers", () => ({
  getProviderLogo: () => "/logos/provider.png",
}));

import { ConnectionHostingScreen } from "./ConnectionHostingScreen";
import { ConnectionProviderGridScreen } from "./ConnectionProviderGridScreen";

describe("Connection choice screens", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseBranding.mockReset().mockReturnValue({ appName: "Milady" });
  });

  it("renders hosting cards with taller targets and readable wrapped descriptions", () => {
    mockUseApp.mockReturnValue({
      handleOnboardingBack: vi.fn(),
      t: (key: string) => key,
    });

    render(
      <ConnectionHostingScreen
        showHostingLocalCard={true}
        dispatch={vi.fn()}
      />,
    );

    const remoteButton = screen.getByRole("button", {
      name: /onboarding\.hostingRemote onboarding\.hostingRemoteDesc/i,
    });
    expect(remoteButton.className).toContain("min-h-[60px]");

    const remoteDescription = screen.getByText("onboarding.hostingRemoteDesc");
    expect(remoteDescription.className).toContain("line-clamp-2");
    expect(remoteDescription.className).not.toContain("line-clamp-1");
  });

  it("renders provider choice descriptions with two-line readable copy instead of truncation", () => {
    mockUseApp.mockReturnValue({
      onboardingRemoteConnected: false,
      t: (key: string) => key,
    });

    render(
      <ConnectionProviderGridScreen
        dispatch={vi.fn()}
        onTransitionEffect={vi.fn()}
        sortedProviders={[
          { id: "openai", name: "OpenAI", description: "GPT API" },
          {
            id: "elizacloud",
            name: "Eliza Cloud",
            description: "LLMs, RPCs & more included",
          },
        ]}
        getProviderDisplay={(provider) => ({
          name: provider.name,
          description: provider.description,
        })}
        getCustomLogo={() => undefined}
        getDetectedLabel={() => null}
      />,
    );

    const providerDescription = screen.getByText("GPT API");
    expect(providerDescription.className).toContain("truncate");
    expect(providerDescription.className).not.toContain("line-clamp-2");
  });
});
