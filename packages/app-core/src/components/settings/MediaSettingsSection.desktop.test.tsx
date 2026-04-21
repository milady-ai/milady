// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testT } from "../../../../../test/helpers/i18n";

const {
  getPluginsMock,
  invokeDesktopBridgeRequestMock,
  isElectrobunRuntimeMock,
} = vi.hoisted(() => ({
  getPluginsMock: vi.fn(),
  invokeDesktopBridgeRequestMock: vi.fn(),
  isElectrobunRuntimeMock: vi.fn(),
}));

vi.mock("../../bridge", () => ({
  getPlugins: getPluginsMock,
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("../../state", () => ({
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
  const settingsControls = {
    Field: passthrough,
    FieldDescription: passthrough,
    FieldLabel: passthrough,
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    MutedText: passthrough,
    SegmentedGroup: passthrough,
    SelectTrigger: passthrough,
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
  };
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
    SettingsControls: settingsControls,
  };
});

import { findButtonByText } from "../../../../../test/helpers/react-test";
import { DesktopMediaControlPanel } from "./MediaSettingsSection";

describe("DesktopMediaControlPanel", () => {
  let cameraPluginMock: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    cameraPluginMock = {
      getDevices: vi.fn().mockResolvedValue({
        devices: [{ deviceId: "cam-1", label: "Front Camera" }],
      }),
      checkPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
      getRecordingState: vi
        .fn()
        .mockResolvedValue({ isRecording: false, duration: 0 }),
      requestPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
      startPreview: vi.fn().mockResolvedValue({}),
      stopPreview: vi.fn().mockResolvedValue(undefined),
      switchCamera: vi.fn().mockResolvedValue({}),
      capturePhoto: vi.fn().mockResolvedValue({ base64: "abc" }),
      startRecording: vi.fn().mockResolvedValue(undefined),
      stopRecording: vi.fn().mockResolvedValue({ path: "/tmp/capture.webm" }),
    };
    getPluginsMock.mockReturnValue({
      camera: { plugin: cameraPluginMock },
    });
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    isElectrobunRuntimeMock.mockReturnValue(true);
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
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

  it("uses the camera plugin for desktop camera actions", async () => {
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
      findButtonByText(root, "Request Camera Permission").props.onClick();
    });
    await act(async () => {
      findButtonByText(root, "Capture Photo").props.onClick();
    });

    expect(cameraPluginMock.requestPermissions).toHaveBeenCalledTimes(1);
    expect(cameraPluginMock.capturePhoto).toHaveBeenCalledTimes(1);
    expect(invokeDesktopBridgeRequestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "cameraRequestPermissions" }),
    );
    expect(invokeDesktopBridgeRequestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "cameraCapturePhoto" }),
    );
  });
});
