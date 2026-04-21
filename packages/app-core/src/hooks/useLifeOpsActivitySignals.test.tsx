// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client-types-core";
import { APP_PAUSE_EVENT, APP_RESUME_EVENT } from "../events";

const mocks = vi.hoisted(() => {
  const captureLifeOpsActivitySignal = vi.fn(async (request) => ({
    signal: {
      id: "signal-1",
      agentId: "agent-1",
      createdAt: "2026-04-06T00:00:00.000Z",
      observedAt: request.observedAt ?? "2026-04-06T00:00:00.000Z",
      idleState: request.idleState ?? null,
      idleTimeSeconds: request.idleTimeSeconds ?? null,
      onBattery: request.onBattery ?? null,
      metadata: request.metadata ?? {},
      platform: request.platform ?? "web_app",
      source: request.source,
      state: request.state,
    },
  }));
  const getStatus = vi.fn(async () => ({
    state: "running",
    agentName: "Milady",
    model: undefined,
    uptime: undefined,
    startedAt: undefined,
  }));
  return {
    captureLifeOpsActivitySignal,
    getStatus,
    isElectrobunRuntime: vi.fn(() => false),
    loadDesktopWorkspaceSnapshot: vi.fn(async () => ({
      supported: false,
      version: null,
      packaged: null,
      autoLaunch: null,
      window: {
        bounds: null,
        maximized: false,
        minimized: false,
        visible: false,
        focused: false,
      },
      power: null,
      primaryDisplay: null,
      displays: [],
      cursor: null,
      clipboard: null,
      paths: {},
    })),
  };
});

vi.mock("../api", () => ({
  client: {
    captureLifeOpsActivitySignal: mocks.captureLifeOpsActivitySignal,
    getStatus: mocks.getStatus,
  },
}));

vi.mock("../bridge/electrobun-runtime", () => ({
  isElectrobunRuntime: mocks.isElectrobunRuntime,
}));

vi.mock("../platform", () => ({
  isNative: false,
}));

vi.mock("../utils/desktop-workspace", () => ({
  loadDesktopWorkspaceSnapshot: mocks.loadDesktopWorkspaceSnapshot,
}));

import { useLifeOpsActivitySignals } from "./useLifeOpsActivitySignals";

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

let latestTree: TestRenderer.ReactTestRenderer | null = null;

function Harness() {
  useLifeOpsActivitySignals(true);
  return null;
}

describe("useLifeOpsActivitySignals", () => {
  beforeEach(() => {
    latestTree = null;
    mocks.captureLifeOpsActivitySignal.mockClear();
    mocks.getStatus.mockReset().mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      uptime: undefined,
      startedAt: undefined,
    });
    mocks.isElectrobunRuntime.mockReset().mockReturnValue(false);
    mocks.loadDesktopWorkspaceSnapshot.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T16:00:00.000Z"));
    setVisibilityState("visible");
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    latestTree?.unmount();
    latestTree = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("captures lifecycle and page activity for the active app", async () => {
    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "app_lifecycle",
        state: "active",
        platform: "web_app",
      }),
    );
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "page_visibility",
        state: "active",
        platform: "web_app",
        metadata: expect.objectContaining({ reason: "mount" }),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new Event(APP_PAUSE_EVENT));
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "app_lifecycle",
        state: "background",
        platform: "web_app",
      }),
    );

    setVisibilityState("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "page_visibility",
        state: "background",
        platform: "web_app",
        metadata: expect.objectContaining({ reason: "visibilitychange" }),
      }),
    );

    setVisibilityState("visible");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "page_visibility",
        state: "active",
        metadata: expect.objectContaining({ reason: "heartbeat" }),
      }),
    );

    await act(async () => {
      document.dispatchEvent(new Event(APP_RESUME_EVENT));
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "app_lifecycle",
        state: "active",
        metadata: expect.objectContaining({ reason: "resume" }),
      }),
    );
  });

  it("captures desktop power and idle data in electrobun", async () => {
    mocks.isElectrobunRuntime.mockReturnValue(true);
    mocks.loadDesktopWorkspaceSnapshot.mockResolvedValue({
      supported: true,
      version: null,
      packaged: null,
      autoLaunch: null,
      window: {
        bounds: null,
        maximized: false,
        minimized: false,
        visible: true,
        focused: true,
      },
      power: {
        onBattery: true,
        idleState: "idle",
        idleTime: 123,
      },
      primaryDisplay: null,
      displays: [],
      cursor: null,
      clipboard: null,
      paths: {},
    });

    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.loadDesktopWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "desktop_power",
        state: "idle",
        platform: "desktop_app",
        idleState: "idle",
        idleTimeSeconds: 123,
        onBattery: true,
        metadata: expect.objectContaining({
          reason: "mount",
          windowFocused: true,
          windowVisible: true,
        }),
      }),
    );
  });

  it("waits for the agent runtime before capturing signals", async () => {
    mocks.getStatus
      .mockResolvedValueOnce({
        state: "starting",
        agentName: "Milady",
        model: undefined,
        uptime: undefined,
        startedAt: undefined,
      })
      .mockResolvedValue({
        state: "running",
        agentName: "Milady",
        model: undefined,
        uptime: undefined,
        startedAt: undefined,
      });

    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "app_lifecycle",
        state: "active",
        platform: "web_app",
      }),
    );
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "page_visibility",
        state: "active",
        metadata: expect.objectContaining({ reason: "runtime-ready" }),
      }),
    );
  });

  it("suppresses expected network telemetry failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.captureLifeOpsActivitySignal.mockRejectedValueOnce(
      new ApiError({
        kind: "network",
        path: "/api/lifeops/activity-signals",
        message: "fetch failed",
      }),
    );

    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not emit signals before the hook is enabled", async () => {
    function DisabledHarness() {
      useLifeOpsActivitySignals(false);
      return null;
    }

    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(DisabledHarness));
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).not.toHaveBeenCalled();
  });

  it("suppresses runtime-unavailable telemetry failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.captureLifeOpsActivitySignal.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 503,
        path: "/api/lifeops/activity-signals",
        message: "Agent runtime is not available",
      }),
    );

    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
