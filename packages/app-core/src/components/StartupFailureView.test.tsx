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
}));

import { StartupFailureView } from "./StartupFailureView";

describe("StartupFailureView", () => {
  beforeEach(() => {
    mockUseBranding.mockReturnValue({
      appUrl: "https://milady.example",
    });
    mockUseApp.mockReturnValue({
      t: (key: string) =>
        (
          ({
            "startupfailureview.StartupFailed": "Startup failed:",
            "startupfailureview.ThisOriginDoesNot":
              "This origin does not host the agent backend.",
            "startupfailureview.RetryStartup": "Retry Startup",
            "startupfailureview.OpenApp": "Open App",
          }) as Record<string, string>
        )[key] ?? key,
    });
  });

  it("renders retry controls and details for startup failures", async () => {
    const onRetry = vi.fn();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "agent-error",
            message: "The agent process exited unexpectedly.",
            detail: "stack trace",
          }}
          onRetry={onRetry}
        />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Startup failed:");
    expect(snapshot).toContain("The agent process exited unexpectedly.");
    expect(snapshot).toContain("stack trace");
    expect(snapshot).toContain("Retry Startup");
  });

  it("shows the open-app action when the backend is unreachable", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "backend-unreachable",
            message: "Failed to reach the app backend.",
            detail: null,
          }}
          onRetry={vi.fn()}
        />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("This origin does not host the agent backend.");
    expect(snapshot).toContain("Open App");
  });
});
