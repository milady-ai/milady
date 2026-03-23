// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  LifecycleProvider,
  useLifecycle,
  type LifecycleContextValue,
} from "./LifecycleContext";

const defaultValue: LifecycleContextValue = {
  connected: false,
  agentStatus: null,
  onboardingComplete: false,
  onboardingLoading: false,
  startupPhase: "starting-backend",
  startupStatus: "loading",
  startupError: null,
  authRequired: false,
  actionNotice: null,
  lifecycleBusy: false,
  lifecycleAction: null,
  pendingRestart: false,
  pendingRestartReasons: [],
  restartBannerDismissed: false,
  backendConnection: {
    state: "disconnected",
    reconnectAttempt: 0,
    maxReconnectAttempts: 15,
    showDisconnectedUI: false,
  },
  backendDisconnectedBannerDismissed: false,
  systemWarnings: [],
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LifecycleProvider value={defaultValue}>{children}</LifecycleProvider>
  );
}

describe("LifecycleProvider", () => {
  it("provides lifecycle values from AppProvider", () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    expect(result.current.startupPhase).toBe("starting-backend");
    expect(result.current.startupStatus).toBe("loading");
    expect(result.current.connected).toBe(false);
  });

  it("passes through ready state", () => {
    const ready: LifecycleContextValue = {
      ...defaultValue,
      startupPhase: "ready",
      startupStatus: "ready",
      connected: true,
      onboardingComplete: true,
    };
    const readyWrapper = ({ children }: { children: ReactNode }) => (
      <LifecycleProvider value={ready}>{children}</LifecycleProvider>
    );
    const { result } = renderHook(() => useLifecycle(), {
      wrapper: readyWrapper,
    });
    expect(result.current.startupStatus).toBe("ready");
    expect(result.current.connected).toBe(true);
    expect(result.current.onboardingComplete).toBe(true);
  });

  it("exposes system warnings", () => {
    const withWarnings: LifecycleContextValue = {
      ...defaultValue,
      systemWarnings: ["test warning"],
    };
    const warnWrapper = ({ children }: { children: ReactNode }) => (
      <LifecycleProvider value={withWarnings}>{children}</LifecycleProvider>
    );
    const { result } = renderHook(() => useLifecycle(), {
      wrapper: warnWrapper,
    });
    expect(result.current.systemWarnings).toEqual(["test warning"]);
  });
});
