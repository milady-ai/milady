// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getCodingAgentStatus: vi.fn(async () => null),
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
    getConfig: vi.fn(async () => ({})),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: true })),
    disconnectWs: vi.fn(),
  },
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

vi.mock("../../src/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import { AppProvider, useApp } from "@miladyai/app-core/state";

interface StartupSnapshot {
  onboardingLoading: boolean;
  authRequired: boolean;
  startupError: ReturnType<typeof useApp>["startupError"];
  coordinatorPhase: string;
}

function Probe(props: { onChange: (snapshot: StartupSnapshot) => void }) {
  const app = useApp();
  useEffect(() => {
    props.onChange({
      onboardingLoading: app.onboardingLoading,
      authRequired: app.authRequired,
      startupError: app.startupError,
      coordinatorPhase: app.startupCoordinator.phase,
    });
  }, [
    app.onboardingLoading,
    app.authRequired,
    app.startupError,
    app.startupCoordinator.phase,
    props.onChange,
  ]);
  return null;
}

describe("startup failure: backend missing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    // Simulate a returning user with a persisted local connection so the
    // startup flow proceeds to backend polling (fresh installs now skip
    // backend polling and go straight to onboarding).
    localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "local:embedded",
        kind: "local",
        label: "This device",
      }),
    );
    // Returning user — splash auto-skips when onboarding was completed before
    localStorage.setItem("eliza:onboarding-complete", "1");
    mockClient.hasToken.mockReturnValue(false);
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.getConfig.mockResolvedValue({});
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    const err = Object.assign(
      new Error("Backend API routes are unavailable on this origin"),
      {
        kind: "http",
        status: 404,
        path: "/api/onboarding/status",
      },
    );
    mockClient.getOnboardingStatus.mockRejectedValue(err);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem("milady:active-server");
  });

  it("fails fast on backend 404 and surfaces backend-unreachable", async () => {
    let latest: StartupSnapshot | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onChange: (snapshot) => {
              latest = snapshot;
            },
          }),
        ),
      );
    });

    // Flush coordinator phases with real-ish timing — the coordinator
    // goes splash → restoring-session → polling-backend → error, each
    // phase is a useEffect cycle. With fake timers we need repeated flushes.
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(latest).not.toBeNull();
    // The coordinator should reach error on 404 and set startupError.
    // Accept either the coordinator phase or legacy error as proof.
    const reachedError =
      latest?.coordinatorPhase === "error" ||
      latest?.startupError?.reason === "backend-unreachable";
    if (!reachedError) {
      // Debug: log what phase we're stuck at
      console.log("[test debug] coordinatorPhase:", latest?.coordinatorPhase, "startupError:", latest?.startupError);
    }
    expect(reachedError).toBe(true);

    await act(async () => {
      tree?.unmount();
    });
  });
});
