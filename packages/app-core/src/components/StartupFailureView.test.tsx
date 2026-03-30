// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockUseBranding,
  openBugReportMock,
  optionalBugReportMock,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseBranding: vi.fn(),
  openBugReportMock: vi.fn(),
  optionalBugReportMock: vi.fn(),
}));

vi.mock("../api", () => ({
  client: {
    checkBugReportInfo: vi.fn().mockResolvedValue({
      nodeVersion: "v22.0.0",
      platform: "win32",
    }),
    submitBugReport: vi.fn().mockResolvedValue({ accepted: true }),
  },
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../config/branding", () => ({
  useBranding: () => mockUseBranding(),
}));

vi.mock("../hooks", () => ({
  useOptionalBugReport: () => optionalBugReportMock(),
}));

import { StartupFailureView } from "./StartupFailureView";

describe("StartupFailureView", () => {
  beforeEach(() => {
    mockUseBranding.mockReturnValue({
      appUrl: "https://milady.example",
    });
    mockUseApp.mockReturnValue({
      t: (key: string, opts?: Record<string, unknown>) => {
        const lookup: Record<string, string> = {
          "startupfailureview.StartupFailed": "Startup failed:",
          "startupfailureview.BackendUnreachable": "Backend Unreachable",
          "startupfailureview.ThisOriginDoesNot":
            "This origin does not host the agent backend.",
          "startupfailureview.RetryStartup": "Retry Startup",
          "startupfailureview.OpenApp": "Open App",
          "bugreportmodal.ReportABug": "Report Bug",
        };
        if (key in lookup) return lookup[key];
        if (opts?.defaultValue && typeof opts.defaultValue === "string") {
          let str = opts.defaultValue;
          for (const [k, v] of Object.entries(opts)) {
            if (k !== "defaultValue") str = str.replace(`{{${k}}}`, String(v));
          }
          return str;
        }
        return key;
      },
    });
    openBugReportMock.mockReset();
    optionalBugReportMock.mockReturnValue({ open: openBugReportMock });
  });

  it("renders retry controls and details for startup failures", async () => {
    const onRetry = vi.fn();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "agent-error",
            phase: "initializing-agent",
            message: "The agent process exited unexpectedly.",
            detail: "stack trace",
          }}
          onRetry={onRetry}
        />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Startup failed:");
    expect(snapshot).toContain("stack trace");
    expect(snapshot).toContain("Retry Startup");
    expect(snapshot).toContain("Report Bug");
  });

  it("does not render the report button when no bug report provider is present", async () => {
    optionalBugReportMock.mockReturnValue(null);

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "agent-error",
            phase: "initializing-agent",
            message: "The agent process exited unexpectedly.",
          }}
          onRetry={vi.fn()}
        />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).not.toContain("Report Bug");
  });

  it("opens bug report with startup diagnostics", async () => {
    const onRetry = vi.fn();

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "backend-unreachable",
            phase: "starting-backend",
            message: "Failed to reach backend",
            detail: "HTTP 404",
            status: 404,
            path: "/api/onboarding/status",
          }}
          onRetry={onRetry}
        />,
      );
    });

    const buttons = tree?.root.findAllByType("button") ?? [];
    const reportButton = buttons.find((button) =>
      button.children.join("").includes("Report Bug"),
    );
    await act(async () => {
      reportButton?.props.onClick();
    });

    expect(openBugReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Backend Unreachable: Failed to reach backend",
        actualBehavior: "Failed to reach backend",
        logs: expect.stringContaining("Path: /api/onboarding/status"),
      }),
    );
  });

  it("shows the open-app action when the backend is unreachable", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <StartupFailureView
          error={{
            reason: "backend-unreachable",
            detail: undefined,
          }}
          onRetry={vi.fn()}
        />,
      );
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Open App");
  });
});
