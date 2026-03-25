// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockUseBranding } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../config/branding", () => ({
  useBranding: () => mockUseBranding(),
  appNameInterpolationVars: () => ({ appName: "Milady" }),
}));

import { PairingView } from "./PairingView";

function createAppState(overrides: Record<string, unknown> = {}) {
  return {
    pairingEnabled: true,
    pairingExpiresAt: Date.now() + 60_000,
    pairingCodeInput: "",
    pairingError: null,
    pairingBusy: false,
    handlePairingSubmit: vi.fn(async () => {}),
    setState: vi.fn(),
    t: (key: string) =>
      (
        ({
          "pairingview.PairingRequired": "Pairing Required",
          "pairingview.EnterThePairingCo":
            "Enter the pairing code from the server logs to authenticate.",
          "pairingview.PairingCode": "Pairing Code",
          "pairingview.EnterPairingCode": "Enter pairing code",
          "pairingview.PairingIsNotEnabl":
            "Pairing is not enabled on this server.",
          "pairingview.NextSteps": "Next steps:",
          "pairingview.AskTheServerOwner":
            "Ask the server owner for an API token.",
          "pairingview.EnablePairingOnTh":
            "Enable pairing on the server and restart Milady.",
          "pairingview.PairingSetupDocs": "Pairing setup docs",
        }) as Record<string, string>
      )[key] ?? key,
    ...overrides,
  };
}

describe("PairingView", () => {
  beforeEach(() => {
    mockUseBranding.mockReturnValue({
      appName: "Milady",
      orgName: "symbiex",
      repoName: "milady",
    });
    mockUseApp.mockReset();
  });

  it("renders the active pairing flow with the setup docs action", async () => {
    mockUseApp.mockReturnValue(createAppState());

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<PairingView />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Pairing Required");
    expect(snapshot).toContain("Pairing Code");
    expect(snapshot).toContain("Pairing setup docs");
  });

  it("renders the disabled-state guidance when pairing is unavailable", async () => {
    mockUseApp.mockReturnValue(
      createAppState({
        pairingEnabled: false,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<PairingView />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Pairing is not enabled on this server.");
    expect(snapshot).toContain("Next steps:");
  });
});
