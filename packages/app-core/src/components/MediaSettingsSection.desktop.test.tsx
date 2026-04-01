// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testT } from "../../../../test/helpers/i18n";

const { invokeDesktopBridgeRequestMock, isElectrobunRuntimeMock } = vi.hoisted(
  () => ({
    invokeDesktopBridgeRequestMock: vi.fn(),
    isElectrobunRuntimeMock: vi.fn(),
  }),
);

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("../state", () => ({
  useApp: () => ({
    t: (key: string, vars?: Record<string, unknown>) => testT(key, vars),
  }),
}));

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);
  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", { type: "button", ...props }, children),
    Select: passthrough,
    SelectTrigger: passthrough,
    SelectValue: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
  };
});

import { findButtonByText } from "../../../../test/helpers/react-test";
import { DesktopMediaControlPanel } from "./MediaSettingsSection";

describe("DesktopMediaControlPanel", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    isElectrobunRuntimeMock.mockReturnValue(true);
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        if (rpcMethod === "cameraGetDevices") {
          return {
            available: true,
            devices: [{ deviceId: "cam-1", label: "Front Camera" }],
          };
        }
        if (rpcMethod === "cameraCheckPermissions")
          return { status: "granted" };
        if (rpcMethod === "cameraGetRecordingState")
          return { recording: false, duration: 0 };
        if (rpcMethod === "screencaptureGetSources") {
          return {
            available: true,
            sources: [{ id: "screen-1", name: "Main Display" }],
          };
        }
        if (rpcMethod === "permissionsCheck") return { status: "granted" };
        if (rpcMethod === "screencaptureGetRecordingState") {
          return { recording: false, duration: 0, paused: false };
        }
        if (rpcMethod === "screencaptureTakeScreenshot") {
          return { available: true, data: "data:image/png;base64,abc" };
        }
        if (rpcMethod === "screencaptureSaveScreenshot") {
          return { available: true, path: "/tmp/capture.png" };
        }
        return undefined;
      },
    );
  });

  it("captures and saves a screenshot through the native bridge", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DesktopMediaControlPanel),
      );
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopMediaControlPanel");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Take Screenshot").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "screencaptureTakeScreenshot" }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "screencaptureSaveScreenshot",
        params: expect.objectContaining({
          filename: "milady-desktop-screenshot.png",
        }),
      }),
    );
  });
});
