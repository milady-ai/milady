// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mobileListeners = new Set<(signal: Record<string, unknown>) => void>();

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
      platform: request.platform ?? "ios",
      source: request.source,
      state: request.state,
    },
  }));
  const healthSnapshot = {
    source: "mobile_health",
    platform: "ios",
    state: "sleeping",
    observedAt: Date.now(),
    idleState: null,
    idleTimeSeconds: null,
    onBattery: false,
    healthSource: "healthkit",
    permissions: {
      sleep: true,
      biometrics: true,
    },
    sleep: {
      available: true,
      isSleeping: true,
      asleepAt: Date.now() - 7 * 60 * 60 * 1000,
      awakeAt: null,
      durationMinutes: 420,
      stage: "asleep",
    },
    biometrics: {
      sampleAt: Date.now() - 10 * 60 * 1000,
      heartRateBpm: 52,
      restingHeartRateBpm: 47,
      heartRateVariabilityMs: 68,
      respiratoryRate: 13.2,
      bloodOxygenPercent: 98,
    },
    warnings: [],
    metadata: { reason: "snapshot" },
  } as const;
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
    getMobileSignalsPlugin: vi.fn(() => ({
      checkPermissions: vi.fn(async () => ({
        status: "granted",
        canRequest: true,
        permissions: {
          sleep: true,
          biometrics: true,
        },
      })),
      requestPermissions: vi.fn(async () => ({
        status: "granted",
        canRequest: false,
        permissions: {
          sleep: true,
          biometrics: true,
        },
      })),
      addListener: vi.fn(async (_eventName, listener) => {
        mobileListeners.add(listener);
        return {
          remove: vi.fn(async () => {
            mobileListeners.delete(listener);
          }),
        };
      }),
      getSnapshot: vi.fn(async () => ({
        supported: true,
        snapshot: {
          source: "mobile_device",
          platform: "ios",
          state: "active",
          observedAt: Date.now(),
          idleState: "active",
          idleTimeSeconds: null,
          onBattery: false,
          metadata: { reason: "snapshot" },
        },
        healthSnapshot,
      })),
      startMonitoring: vi.fn(async () => {
        const snapshot = {
          source: "mobile_device",
          platform: "ios",
          state: "active",
          observedAt: Date.now(),
          idleState: "active",
          idleTimeSeconds: null,
          onBattery: false,
          metadata: { reason: "start" },
        } as const;
        for (const listener of mobileListeners) {
          listener(snapshot);
          listener(healthSnapshot);
        }
        return {
          enabled: true,
          supported: true,
          platform: "ios",
          snapshot,
          healthSnapshot,
        };
      }),
      stopMonitoring: vi.fn(async () => ({ stopped: true })),
    })),
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

vi.mock("../bridge/native-plugins", () => ({
  getMobileSignalsPlugin: mocks.getMobileSignalsPlugin,
}));

vi.mock("../platform", () => ({
  isNative: true,
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

describe("useLifeOpsActivitySignals mobile bridge", () => {
  beforeEach(() => {
    latestTree = null;
    mobileListeners.clear();
    mocks.captureLifeOpsActivitySignal.mockClear();
    mocks.getStatus.mockReset().mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      uptime: undefined,
      startedAt: undefined,
    });
    mocks.getMobileSignalsPlugin.mockClear();
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

  it("forwards native mobile lifecycle signals into LifeOps", async () => {
    await act(async () => {
      latestTree = TestRenderer.create(React.createElement(Harness));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getMobileSignalsPlugin).toHaveBeenCalledTimes(1);
    const plugin = mocks.getMobileSignalsPlugin.mock.results[0]?.value;
    expect(plugin.checkPermissions).toHaveBeenCalledTimes(1);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mobile_device",
        platform: "ios",
        state: "active",
      }),
    );
    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mobile_health",
        platform: "ios",
        state: "sleeping",
        health: expect.objectContaining({
          source: "healthkit",
          permissions: expect.objectContaining({
            sleep: true,
            biometrics: true,
          }),
        }),
      }),
    );

    await act(async () => {
      for (const listener of mobileListeners) {
        listener({
          source: "mobile_device",
          platform: "ios",
          state: "locked",
          observedAt: Date.now() + 1_000,
          idleState: "locked",
          idleTimeSeconds: null,
          onBattery: true,
          metadata: {
            reason: "screen_off",
            isProtectedDataAvailable: false,
          },
        });
      }
      await Promise.resolve();
    });

    expect(mocks.captureLifeOpsActivitySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mobile_device",
        platform: "ios",
        state: "locked",
        idleState: "locked",
        onBattery: true,
        metadata: expect.objectContaining({
          reason: "screen_off",
        }),
      }),
    );
  });
});
