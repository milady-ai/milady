// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  invokeDesktopBridgeRequestMock,
  isElectrobunRuntimeMock,
  subscribeDesktopBridgeEventMock,
  useAppMock,
} = vi.hoisted(() => ({
  invokeDesktopBridgeRequestMock: vi.fn(),
  isElectrobunRuntimeMock: vi.fn(),
  subscribeDesktopBridgeEventMock: vi.fn(() => vi.fn()),
  useAppMock: vi.fn(),
}));

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
  subscribeDesktopBridgeEvent: subscribeDesktopBridgeEventMock,
}));

vi.mock("../state", () => ({
  useApp: useAppMock,
}));

vi.mock("../utils/desktop-workspace", () => ({
  openDesktopSurfaceWindow: vi.fn(),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
}));

import { ReleaseCenterView } from "./ReleaseCenterView";

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  text: string,
): TestRenderer.ReactTestInstance {
  const match = root.findAll(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(text),
      ),
  )[0];

  if (!match) {
    throw new Error(`Button "${text}" not found`);
  }

  return match;
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("ReleaseCenterView auto-update guard", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset().mockReturnValue(true);
    subscribeDesktopBridgeEventMock.mockReset().mockReturnValue(vi.fn());
    useAppMock.mockReset().mockReturnValue({
      loadUpdateStatus: vi.fn(() => Promise.resolve()),
      updateLoading: false,
      updateStatus: {
        currentVersion: "1.0.0",
        channel: "stable",
        installMethod: "npm",
        updateAvailable: false,
        latestVersion: null,
        channels: { stable: "1.0.0", canary: null, dev: null },
        distTags: { stable: "latest", canary: "canary", dev: "dev" },
        lastCheckAt: null,
        error: null,
      },
    });

    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        switch (rpcMethod) {
          case "desktopGetUpdaterState":
            return {
              currentVersion: "1.0.0",
              appBundlePath: "/Volumes/Milady/Milady.app",
              canAutoUpdate: false,
              autoUpdateDisabledReason:
                "Move Milady.app to /Applications to enable in-place desktop updates.",
              updateAvailable: false,
              updateReady: true,
              latestVersion: null,
              baseUrl: "https://milady.ai/releases/",
              lastStatus: null,
            };
          case "desktopGetBuildInfo":
            return {
              platform: "darwin",
              arch: "arm64",
              defaultRenderer: "native",
              availableRenderers: ["native", "cef"],
              bunVersion: "1.2.3",
            };
          case "desktopGetDockIconVisibility":
            return { visible: true };
          case "desktopGetWebGpuBrowserStatus":
            return {
              available: false,
              reason: "Renderer WebGPU unavailable in test.",
              renderer: "native",
              chromeBetaPath: null,
              downloadUrl: null,
            };
          case "desktopGetSessionSnapshot":
            return {
              partition: "persist:default",
              persistent: true,
              cookieCount: 0,
              cookies: [],
            };
          default:
            return null;
        }
      },
    );
  });

  it("disables in-place desktop update actions outside Applications", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ReleaseCenterView));
    });

    if (!renderer) {
      throw new Error("ReleaseCenterView did not render");
    }

    const root = renderer.root;
    expect(textOf(root)).toContain(
      "Move Milady.app to /Applications to enable in-place desktop updates.",
    );
    expect(
      findButtonByText(root, "Check / Download Update").props.disabled,
    ).toBe(true);
    expect(
      findButtonByText(root, "Apply Downloaded Update").props.disabled,
    ).toBe(true);
  });
});
