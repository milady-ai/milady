// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppMock, mockOpenExternalUrl } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
  mockOpenExternalUrl: vi.fn(async () => {}),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => useAppMock(),
}));

vi.mock("../../config", () => ({
  useBranding: () => ({ bugReportUrl: "https://example.invalid/bug-report" }),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

import { CloudLoginStep } from "./CloudLoginStep";

describe("CloudLoginStep", () => {
  beforeEach(() => {
    useAppMock.mockReset();
    mockOpenExternalUrl.mockReset();
  });

  it("shows a retry action when cloud login fails", async () => {
    const handleCloudLogin = vi.fn();
    useAppMock.mockReturnValue({
      onboardingStep: "cloud_login",
      elizaCloudConnected: false,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: "Login failed",
      handleCloudLogin,
      handleOnboardingNext: vi.fn(),
      handleOnboardingBack: vi.fn(),
      t: (key: string) => key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(<CloudLoginStep />);
    });

    if (!renderer) {
      throw new Error("CloudLoginStep did not render");
    }

    const buttons = renderer.root.findAllByType("button");
    const retryButton = buttons.find((button) =>
      button.children.includes("onboarding.cloudLoginRetry"),
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.props.onClick({ currentTarget: null });
    });

    expect(handleCloudLogin).toHaveBeenCalledTimes(1);

    const reportIssueButton = buttons.find((button) =>
      button.children.includes("onboarding.reportIssue"),
    );
    expect(reportIssueButton).toBeDefined();

    await act(async () => {
      reportIssueButton?.props.onClick();
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://example.invalid/bug-report",
    );
  });

  it("auto-advances once when cloud login is already connected", async () => {
    const handleOnboardingNext = vi.fn();
    useAppMock.mockReturnValue({
      onboardingStep: "cloud_login",
      elizaCloudConnected: true,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: "",
      handleCloudLogin: vi.fn(),
      handleOnboardingNext,
      handleOnboardingBack: vi.fn(),
      t: (key: string) => key,
    });

    await act(async () => {
      TestRenderer.create(<CloudLoginStep />);
    });

    expect(handleOnboardingNext).toHaveBeenCalledTimes(1);
  });

  it("renders the connected state with the shared compact success banner", async () => {
    useAppMock.mockReturnValue({
      onboardingStep: "cloud_login",
      elizaCloudConnected: true,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: "",
      handleCloudLogin: vi.fn(),
      handleOnboardingNext: vi.fn(),
      handleOnboardingBack: vi.fn(),
      t: (key: string) =>
        key === "onboarding.cloudLoginConnected"
          ? "Connected to Eliza Cloud"
          : key === "onboarding.connected"
            ? "Connected"
            : key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(<CloudLoginStep />);
    });

    if (!renderer) {
      throw new Error("CloudLoginStep did not render");
    }

    const statusDiv = renderer.root.findByProps({ role: "status" });
    expect(statusDiv.props.className).toContain("max-w-[25rem]");
    expect(statusDiv.children).toContain("Connected to Eliza Cloud");
  });

  it("renders the back action with onboarding-owned secondary styling", async () => {
    useAppMock.mockReturnValue({
      onboardingStep: "cloud_login",
      elizaCloudConnected: false,
      elizaCloudLoginBusy: false,
      elizaCloudLoginError: "",
      handleCloudLogin: vi.fn(),
      handleOnboardingNext: vi.fn(),
      handleOnboardingBack: vi.fn(),
      t: (key: string) => key,
    });

    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(<CloudLoginStep />);
    });

    if (!renderer) {
      throw new Error("CloudLoginStep did not render");
    }

    const buttons = renderer.root.findAllByType("button");
    const skipButton = buttons.find((button) =>
      button.children.includes("onboarding.skip"),
    );
    expect(skipButton).toBeDefined();
    expect(String(skipButton?.props.className)).toContain("min-h-[44px]");
    expect(String(skipButton?.props.className)).toContain(
      "hover:bg-[var(--onboarding-secondary-hover-bg)]",
    );
    expect(String(skipButton?.props.className)).not.toContain(
      "-webkit-text-stroke",
    );
    expect(String(skipButton?.props.className)).not.toContain("bg-bg-accent");
  });
});
