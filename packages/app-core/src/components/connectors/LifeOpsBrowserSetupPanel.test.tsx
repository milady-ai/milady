// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClient,
  mockInvokeDesktopBridgeRequest,
  mockCopyTextToClipboard,
  mockOpenExternalUrl,
} = vi.hoisted(() => ({
  mockClient: {
    getBaseUrl: vi.fn(),
    getLifeOpsBrowserSettings: vi.fn(),
    listLifeOpsBrowserCompanions: vi.fn(),
    getLifeOpsBrowserCurrentPage: vi.fn(),
    getLifeOpsBrowserPackageStatus: vi.fn(),
    buildLifeOpsBrowserCompanionPackage: vi.fn(),
    createLifeOpsBrowserCompanionPairing: vi.fn(),
    downloadLifeOpsBrowserCompanionPackage: vi.fn(),
    updateLifeOpsBrowserSettings: vi.fn(),
  },
  mockInvokeDesktopBridgeRequest: vi.fn(),
  mockCopyTextToClipboard: vi.fn(),
  mockOpenExternalUrl: vi.fn(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../bridge", () => ({
  invokeDesktopBridgeRequest: (request: unknown) =>
    mockInvokeDesktopBridgeRequest(request),
  isElectrobunRuntime: () => true,
}));

vi.mock("../../utils", () => ({
  copyTextToClipboard: (value: string) => mockCopyTextToClipboard(value),
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

vi.mock("@miladyai/ui", () => {
  const div = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Badge: div,
    Button: ({
      children,
      onClick,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(
        "button",
        {
          type: "button",
          onClick,
          ...props,
        },
        children,
      ),
    Card: div,
    CardContent: div,
    CardHeader: div,
    CardTitle: div,
    Input: ({
      onChange,
      value,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("input", { onChange, value, ...props }),
    Label: ({
      children,
      htmlFor,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("label", { htmlFor, ...props }, children),
    Switch: ({
      checked,
      onCheckedChange,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("input", {
        type: "checkbox",
        checked,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          onCheckedChange?.(event.currentTarget.checked),
        ...props,
      }),
    Textarea: ({
      onChange,
      value,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("textarea", { onChange, value, ...props }),
  };
});

vi.mock("lucide-react", () => {
  const icon = () => React.createElement("span");
  return {
    Copy: icon,
    Download: icon,
    FolderOpen: icon,
    Package: icon,
    RefreshCw: icon,
    ShieldCheck: icon,
    Sparkles: icon,
  };
});

import { LifeOpsBrowserSetupPanel } from "./LifeOpsBrowserSetupPanel";

describe("LifeOpsBrowserSetupPanel", () => {
  beforeEach(() => {
    mockClient.getBaseUrl.mockReset().mockReturnValue("https://remote.example");
    mockClient.getLifeOpsBrowserSettings.mockReset().mockResolvedValue({
      settings: {
        enabled: true,
        trackingMode: "current_tab",
        allowBrowserControl: true,
        requireConfirmationForAccountAffecting: true,
        incognitoEnabled: false,
        siteAccessMode: "current_site_only",
        grantedOrigins: [],
        blockedOrigins: [],
        maxRememberedTabs: 10,
        pauseUntil: null,
        metadata: {},
        updatedAt: null,
      },
    });
    mockClient.listLifeOpsBrowserCompanions.mockReset().mockResolvedValue({
      companions: [],
    });
    mockClient.getLifeOpsBrowserCurrentPage.mockReset().mockResolvedValue({
      page: null,
    });
    mockClient.getLifeOpsBrowserPackageStatus.mockReset().mockResolvedValue({
      status: {
        extensionPath: "/tmp/lifeops-browser",
        chromeBuildPath: null,
        chromePackagePath: null,
        safariWebExtensionPath: null,
        safariAppPath: null,
        safariPackagePath: null,
      },
    });
    mockClient.buildLifeOpsBrowserCompanionPackage
      .mockReset()
      .mockResolvedValue({
        status: {
          extensionPath: "/tmp/lifeops-browser",
          chromeBuildPath: "/tmp/lifeops-browser/dist/chrome",
          chromePackagePath:
            "/tmp/lifeops-browser/dist/artifacts/lifeops-browser-chrome.zip",
          safariWebExtensionPath: null,
          safariAppPath: null,
          safariPackagePath: null,
        },
      });
    mockClient.createLifeOpsBrowserCompanionPairing
      .mockReset()
      .mockResolvedValue({
        companion: {
          id: "companion-1",
          browser: "chrome",
          profileId: "default",
          profileLabel: "Default",
          label: "LifeOps Browser chrome Default",
        },
        pairingToken: "lobr_token",
      });
    mockClient.downloadLifeOpsBrowserCompanionPackage.mockReset();
    mockClient.updateLifeOpsBrowserSettings.mockReset();
    mockInvokeDesktopBridgeRequest.mockReset().mockResolvedValue(undefined);
    mockCopyTextToClipboard.mockReset().mockResolvedValue(undefined);
    mockOpenExternalUrl.mockReset().mockResolvedValue(undefined);
  });

  it("prepares a one-click Chrome install flow", async () => {
    render(<LifeOpsBrowserSetupPanel />);

    const installButton = await screen.findByRole("button", {
      name: "Install Chrome",
    });
    fireEvent.click(installButton);

    await waitFor(() =>
      expect(
        mockClient.buildLifeOpsBrowserCompanionPackage,
      ).toHaveBeenCalledWith("chrome"),
    );
    await waitFor(() =>
      expect(
        mockClient.createLifeOpsBrowserCompanionPairing,
      ).toHaveBeenCalledWith({
        browser: "chrome",
        profileId: "default",
        profileLabel: "Default",
        label: "LifeOps Browser chrome Default",
      }),
    );
    await waitFor(() =>
      expect(mockCopyTextToClipboard).toHaveBeenCalledWith(
        JSON.stringify(
          {
            apiBaseUrl: "https://remote.example",
            companionId: "companion-1",
            pairingToken: "lobr_token",
            browser: "chrome",
            profileId: "default",
            profileLabel: "Default",
            label: "LifeOps Browser chrome Default",
          },
          null,
          2,
        ),
      ),
    );
    await waitFor(() =>
      expect(mockInvokeDesktopBridgeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          rpcMethod: "desktopShowItemInFolder",
          params: { path: "/tmp/lifeops-browser/dist/chrome" },
        }),
      ),
    );
    await waitFor(() =>
      expect(mockOpenExternalUrl).toHaveBeenCalledWith("chrome://extensions/"),
    );
    expect(await screen.findByText(/Chrome install is prepared/i)).toBeTruthy();
  });
});
