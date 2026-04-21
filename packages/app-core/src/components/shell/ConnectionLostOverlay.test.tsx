// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, relaunchDesktopMock, retryBackendConnectionMock } =
  vi.hoisted(() => ({
    mockUseApp: vi.fn(),
    relaunchDesktopMock: vi.fn().mockResolvedValue(undefined),
    retryBackendConnectionMock: vi.fn(),
  }));

vi.mock("../../bridge", () => ({
  isElectrobunRuntime: () => true,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { ConnectionLostOverlay } from "./ConnectionLostOverlay";

describe("ConnectionLostOverlay", () => {
  beforeEach(() => {
    relaunchDesktopMock.mockClear();
    retryBackendConnectionMock.mockClear();
    mockUseApp.mockReturnValue({
      backendConnection: {
        state: "failed",
        reconnectAttempt: 15,
        maxReconnectAttempts: 15,
        showDisconnectedUI: true,
      },
      relaunchDesktop: relaunchDesktopMock,
      retryBackendConnection: retryBackendConnectionMock,
      t: (key: string, opts?: Record<string, unknown>) => {
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
  });

  it("renders restart and retry actions when the backend connection fails", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<ConnectionLostOverlay />);
    });

    const snapshot = JSON.stringify(tree?.toJSON());
    expect(snapshot).toContain("Connection Lost");
    expect(snapshot).toContain("Restart App");
    expect(snapshot).toContain("Retry Connection");
  });

  it("relaunches the desktop shell from the restart action", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<ConnectionLostOverlay />);
    });

    const restartButton = tree.root
      .findAllByType("button")
      .find((button) => button.children.join("").includes("Restart App"));

    await act(async () => {
      restartButton?.props.onClick();
    });

    expect(relaunchDesktopMock).toHaveBeenCalledTimes(1);
  });

  it("retries the connection without relaunching the app", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<ConnectionLostOverlay />);
    });

    const retryButton = tree.root
      .findAllByType("button")
      .find((button) => button.children.join("").includes("Retry Connection"));

    await act(async () => {
      retryButton?.props.onClick();
    });

    expect(retryBackendConnectionMock).toHaveBeenCalledTimes(1);
    expect(relaunchDesktopMock).not.toHaveBeenCalled();
  });

  it("renders nothing while the client is still reconnecting", async () => {
    mockUseApp.mockReturnValue({
      backendConnection: {
        state: "reconnecting",
        reconnectAttempt: 3,
        maxReconnectAttempts: 15,
        showDisconnectedUI: false,
      },
      relaunchDesktop: relaunchDesktopMock,
      retryBackendConnection: retryBackendConnectionMock,
      t: (key: string, opts?: Record<string, unknown>) =>
        typeof opts?.defaultValue === "string" ? opts.defaultValue : key,
    });

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<ConnectionLostOverlay />);
    });

    expect(tree?.toJSON()).toBeNull();
  });
});
