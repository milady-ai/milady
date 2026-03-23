// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { LifecycleProvider } from "./LifecycleContext";

// Import hook directly since not publicly exported
import { useLifecycle } from "./LifecycleContext";

function wrapper({ children }: { children: ReactNode }) {
  return <LifecycleProvider>{children}</LifecycleProvider>;
}

describe("LifecycleProvider", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    expect(result.current.startupPhase).toBe("starting-backend");
    expect(result.current.startupStatus).toBe("loading");
    expect(result.current.connected).toBe(false);
    expect(result.current.agentStatus).toBeNull();
  });

  it("setStartupPhase to ready updates startupStatus", () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    act(() => {
      result.current.setOnboardingLoading(false);
      result.current.setOnboardingComplete(true);
      result.current.setStartupPhase("ready");
    });
    expect(result.current.startupStatus).toBe("ready");
  });

  it("setConnected updates connection state", () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    act(() => {
      result.current.setConnected(true);
    });
    expect(result.current.connected).toBe(true);
  });

  it("setActionNotice shows and auto-clears", async () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    act(() => {
      result.current.setActionNotice("Test notice", "success", 100);
    });
    expect(result.current.actionNotice?.text).toBe("Test notice");
    expect(result.current.actionNotice?.tone).toBe("success");
  });

  it("setAgentStatus syncs ref", () => {
    const { result } = renderHook(() => useLifecycle(), { wrapper });
    const status = { state: "running" as const, agentName: "Jin", model: "anthropic", startedAt: Date.now() };
    act(() => {
      result.current.setAgentStatus(status);
    });
    expect(result.current.agentStatus).toEqual(status);
    expect(result.current.agentStatusRef.current).toEqual(status);
  });
});
