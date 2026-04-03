// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOnboardingState } from "./useOnboardingState";

describe("useOnboardingState", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("replaces deferred tasks exactly when requested", () => {
    const { result } = renderHook(() => useOnboardingState());

    act(() => {
      result.current.addDeferredTask("restart-runtime");
      result.current.addDeferredTask("sync-wallet");
    });

    expect(result.current.state.deferredTasks).toEqual([
      "restart-runtime",
      "sync-wallet",
    ]);

    act(() => {
      result.current.setDeferredTasks([]);
    });

    expect(result.current.state.deferredTasks).toEqual([]);

    act(() => {
      result.current.setDeferredTasks([
        "open-settings",
        "open-settings",
        "review-logs",
      ]);
    });

    expect(result.current.state.deferredTasks).toEqual([
      "open-settings",
      "review-logs",
    ]);
  });

  it("hydrates the remote onboarding fields from the active server record", () => {
    window.localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "remote:https://ren.example.com",
        kind: "remote",
        label: "ren.example.com",
        apiBase: "https://ren.example.com",
        accessToken: "token-123",
      }),
    );

    const { result } = renderHook(() => useOnboardingState());

    expect(result.current.state.remote.status).toBe("connected");
    expect(result.current.state.remoteApiBase).toBe("https://ren.example.com");
    expect(result.current.state.remoteToken).toBe("token-123");
  });
});
