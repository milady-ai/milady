// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useOnboardingState } from "./useOnboardingState";

describe("useOnboardingState", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("initializes remote onboarding state from the active server record", () => {
    window.localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "remote:kei",
        kind: "remote",
        label: "Kei",
        apiBase: "https://kei.example/api",
        accessToken: "remote-token",
      }),
    );
    window.sessionStorage.setItem(
      "milady_api_base",
      "https://stale-session.example/api",
    );

    const { result } = renderHook(() => useOnboardingState());

    expect(result.current.state.serverTarget).toBe("remote");
    expect(result.current.state.remote.status).toBe("connected");
    expect(result.current.state.remoteApiBase).toBe("https://kei.example/api");
    expect(result.current.state.remoteToken).toBe("remote-token");
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

    expect(result.current.state.serverTarget).toBe("remote");
    expect(result.current.state.remote.status).toBe("connected");
    expect(result.current.state.remoteApiBase).toBe("https://ren.example.com");
    expect(result.current.state.remoteToken).toBe("token-123");
  });

  it("hydrates local hosting from the active server record", () => {
    window.localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "local:embedded",
        kind: "local",
        label: "This device",
      }),
    );

    const { result } = renderHook(() => useOnboardingState());

    expect(result.current.state.serverTarget).toBe("local");
    expect(result.current.state.remote.status).toBe("idle");
    expect(result.current.state.remoteApiBase).toBe("");
  });

  it("hydrates Eliza Cloud hosting from the active server record", () => {
    window.localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "cloud:https://api.eliza.ai",
        kind: "cloud",
        label: "Eliza Cloud",
        apiBase: "https://api.eliza.ai",
        accessToken: "cloud-token",
      }),
    );

    const { result } = renderHook(() => useOnboardingState());

    expect(result.current.state.serverTarget).toBe("elizacloud");
    expect(result.current.state.remote.status).toBe("idle");
    expect(result.current.state.remoteToken).toBe("cloud-token");
  });

  it("updates the canonical hosting target directly", () => {
    const { result } = renderHook(() => useOnboardingState());

    act(() => {
      result.current.setField("serverTarget", "remote");
    });

    expect(result.current.state.serverTarget).toBe("remote");

    act(() => {
      result.current.setField("serverTarget", "local");
    });

    expect(result.current.state.serverTarget).toBe("local");
  });
});
