import { StartupFailureView } from "@miladyai/app-core/components";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { openBugReportMock, optionalBugReportMock } = vi.hoisted(() => ({
  openBugReportMock: vi.fn(),
  optionalBugReportMock: vi.fn(),
}));

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    checkBugReportInfo: vi.fn().mockResolvedValue({
      nodeVersion: "v22.0.0",
      platform: "win32",
    }),
    submitBugReport: vi.fn().mockResolvedValue({ accepted: true }),
  },
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
}));

vi.mock("@miladyai/app-core/state", () => ({
  CUSTOM_ONBOARDING_STEPS: [],
  useApp: () => ({
    uiLanguage: "en",
    t: (
      k: string,
      vars?: {
        defaultValue?: string;
      },
    ) => {
      if (k === "startupfailureview.StartupFailed") return "Startup Failed:";
      if (k === "startupfailureview.ThisOriginDoesNot")
        return "This origin does not host the agent backend.";
      if (k === "startupfailureview.OpenApp") return "Open App";
      return vars?.defaultValue ?? k;
    },
  }),
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useOptionalBugReport: () => optionalBugReportMock(),
}));

describe("StartupFailureView", () => {
  beforeEach(() => {
    optionalBugReportMock.mockReturnValue({ open: openBugReportMock });
  });

  it("renders backend-unreachable hint and open-app CTA, then triggers retry", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "backend-unreachable",
            phase: "starting-backend",
            message: "Backend unavailable",
            detail: "/api/status - HTTP 404 - Not found",
            status: 404,
            path: "/api/status",
          },
          onRetry,
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const heading = tree.root.findByType("h1").children.join("");
    expect(heading).toContain("Backend Unreachable");
    const openAppLink = tree.root.findByType("a");
    expect(openAppLink.props.href).toBe("https://app.elizaos.ai");
    expect(openAppLink.children.join("")).toContain("Open App");

    const retryButton = tree.root.findAllByType("button")[0];
    if (!retryButton) throw new Error("missing retry button");
    await act(async () => {
      retryButton.props.onClick();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render open-app CTA for non-backend failures", async () => {
    const onRetry = vi.fn();
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-timeout",
            phase: "initializing-agent",
            message: "Agent timed out",
          },
          onRetry,
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");
    const links = tree.root.findAllByType("a");
    expect(links).toHaveLength(0);
  });

  it("renders the asset-missing label for startup asset failures", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "asset-missing",
            phase: "initializing-agent",
            message: "Required companion assets could not be loaded.",
            detail: "Bundled avatar ELIZA-01 could not be loaded.",
          },
          onRetry: vi.fn(),
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");
    const heading = tree.root.findByType("h1").children.join("");
    expect(heading).toContain("Asset Missing");
  });

  it("opens the local bug report modal with startup context", async () => {
    openBugReportMock.mockClear();

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-error",
            phase: "initializing-agent",
            message: "Agent boot failed",
            detail: "stack trace",
            path: "/api/status",
          },
          onRetry: vi.fn(),
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const reportButton = tree.root
      .findAllByType("button")
      .find((button) =>
        button.children.join("").includes("bugreportmodal.ReportABug"),
      );
    if (!reportButton) throw new Error("missing local report button");

    await act(async () => {
      reportButton.props.onClick();
    });

    expect(openBugReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actualBehavior: "Agent boot failed",
        logs: expect.stringContaining("Reason: agent-error"),
      }),
    );
  });

  it("submits a one-click diagnostic report", async () => {
    mockClient.checkBugReportInfo.mockClear();
    mockClient.submitBugReport
      .mockClear()
      .mockResolvedValue({ accepted: true });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-error",
            phase: "initializing-agent",
            message: "Agent boot failed",
            detail: "stack trace",
            path: "/api/status",
          },
          onRetry: vi.fn(),
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const shareButton = tree.root
      .findAllByType("button")
      .find((button) =>
        button.children.join("").includes("Share diagnostic report"),
      );
    if (!shareButton) throw new Error("missing share button");

    await act(async () => {
      await shareButton.props.onClick();
    });

    expect(mockClient.checkBugReportInfo).toHaveBeenCalledOnce();
    expect(mockClient.submitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "startup-failure",
        startup: expect.objectContaining({
          reason: "agent-error",
          phase: "initializing-agent",
          path: "/api/status",
        }),
      }),
    );
    const snapshot = JSON.stringify(tree.toJSON());
    expect(snapshot).toContain("Diagnostic report shared successfully.");
  });

  it("does not render the local report action without bug report context", async () => {
    optionalBugReportMock.mockReturnValue(null);

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-error",
            phase: "initializing-agent",
            message: "Agent boot failed",
          },
          onRetry: vi.fn(),
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");
    const reportButton = tree.root
      .findAllByType("button")
      .find((button) =>
        button.children.join("").includes("bugreportmodal.ReportABug"),
      );
    expect(reportButton).toBeUndefined();
  });

  it("does not claim success when the share flow falls back to manual submission", async () => {
    mockClient.checkBugReportInfo.mockClear();
    mockClient.submitBugReport.mockClear().mockResolvedValue({
      fallback: "https://github.com/milady-ai/milady/issues/new",
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(StartupFailureView, {
          error: {
            reason: "agent-error",
            phase: "initializing-agent",
            message: "Agent boot failed",
            detail: "stack trace",
            path: "/api/status",
          },
          onRetry: vi.fn(),
        }),
      );
    });

    if (!tree) throw new Error("failed to render StartupFailureView");

    const shareButton = tree.root
      .findAllByType("button")
      .find((button) =>
        button.children.join("").includes("Share diagnostic report"),
      );
    if (!shareButton) throw new Error("missing share button");

    await act(async () => {
      await shareButton.props.onClick();
    });

    const snapshot = JSON.stringify(tree.toJSON());
    expect(snapshot).toContain(
      "Use Report Bug to review and submit it manually.",
    );
    expect(snapshot).not.toContain("Diagnostic report shared successfully.");
  });
});
