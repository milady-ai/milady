// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getElectrobunRendererRpcMock,
  invokeDesktopBridgeRequestMock,
  getPlatformMock,
  isNativePlatformMock,
} = vi.hoisted(() => ({
  getElectrobunRendererRpcMock: vi.fn(),
  invokeDesktopBridgeRequestMock: vi.fn(),
  getPlatformMock: vi.fn(() => "web"),
  isNativePlatformMock: vi.fn(() => false),
}));

vi.mock("../bridge/electrobun-rpc", () => ({
  getElectrobunRendererRpc: getElectrobunRendererRpcMock,
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: getPlatformMock,
    isNativePlatform: isNativePlatformMock,
  },
}));

import { __voiceChatInternals } from "./useVoiceChat";

describe("__voiceChatInternals", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    getElectrobunRendererRpcMock.mockReset();
    invokeDesktopBridgeRequestMock.mockReset();
    getPlatformMock.mockReset();
    getPlatformMock.mockReturnValue("web");
    isNativePlatformMock.mockReset();
    isNativePlatformMock.mockReturnValue(false);
  });

  it("keeps native talk mode on Windows Electrobun", () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    getElectrobunRendererRpcMock.mockReturnValue({
      request: {},
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    expect(__voiceChatInternals.shouldPreferNativeTalkMode()).toBe(true);
    expect(__voiceChatInternals.shouldAutoRestartBrowserRecognition()).toBe(
      false,
    );
    expect(__voiceChatInternals.isWindowsElectrobunRenderer()).toBe(true);
  });

  it("keeps native talk mode on non-Windows Electrobun", () => {
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
    getElectrobunRendererRpcMock.mockReturnValue({
      request: {},
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    });

    expect(__voiceChatInternals.shouldPreferNativeTalkMode()).toBe(true);
    expect(__voiceChatInternals.shouldAutoRestartBrowserRecognition()).toBe(
      true,
    );
    expect(__voiceChatInternals.isWindowsElectrobunRenderer()).toBe(false);
  });

  it("keeps browser auto-restart enabled off desktop bridge runtimes", () => {
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });
    getElectrobunRendererRpcMock.mockReturnValue(null);

    expect(__voiceChatInternals.isWindowsElectrobunRenderer()).toBe(false);
    expect(__voiceChatInternals.shouldAutoRestartBrowserRecognition()).toBe(
      true,
    );
  });
});
