// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    Input: ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Card: passthrough,
    CardContent: passthrough,
    CardHeader: passthrough,
    CardTitle: passthrough,
    CardDescription: passthrough,
    Select: passthrough,
    SelectTrigger: passthrough,
    SelectValue: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
    Switch: passthrough,
  };
});

import { findButtonByText } from "../../../../test/helpers/react-test";
import { DesktopTalkModePanel } from "./VoiceConfigView";

describe("DesktopTalkModePanel", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    isElectrobunRuntimeMock.mockReturnValue(true);
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        if (rpcMethod === "talkmodeGetState") return { state: "idle" };
        if (rpcMethod === "talkmodeIsEnabled") return { enabled: false };
        if (rpcMethod === "talkmodeIsSpeaking") return { speaking: false };
        if (rpcMethod === "talkmodeGetWhisperInfo")
          return { available: true, modelSize: "base" };
        if (rpcMethod === "talkmodeStart") return { available: true };
        return undefined;
      },
    );
  });

  it("starts talk mode and sends a speech request", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(DesktopTalkModePanel));
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopTalkModePanel");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "voiceconfigview.StartTalkMode").props.onClick();
    });
    await act(async () => {
      findButtonByText(root, "voiceconfigview.SpeakTestPhrase").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "talkmodeStart" }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "talkmodeSpeak",
        params: { text: "voiceconfigview.testPhrase" },
      }),
    );
  });
});
