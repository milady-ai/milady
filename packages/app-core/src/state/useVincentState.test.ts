// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVincentStatus = vi.fn();
const mockVincentStartLogin = vi.fn();
const mockVincentDisconnect = vi.fn();

vi.mock("../api", () => ({
  client: {
    vincentStatus: (...args: unknown[]) => mockVincentStatus(...args),
    vincentStartLogin: (...args: unknown[]) => mockVincentStartLogin(...args),
    vincentDisconnect: (...args: unknown[]) => mockVincentDisconnect(...args),
  },
}));

vi.mock("../utils", () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

import { useVincentState } from "./useVincentState";

describe("useVincentState — handleVincentLogin poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVincentStatus.mockResolvedValue({
      connected: false,
      connectedAt: null,
    });
    mockVincentStartLogin.mockResolvedValue({
      authUrl:
        "https://heyvincent.ai/api/oauth/public/authorize?client_id=test",
      state: "test-state",
      redirectUri: "http://localhost/callback/vincent",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("clears busy and shows success when poll returns connected", async () => {
    const setActionNotice = vi.fn();
    const t = (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? key;

    const { result } = renderHook(() =>
      useVincentState({ setActionNotice, t }),
    );

    // Initially not connected
    expect(result.current.vincentLoginBusy).toBe(false);

    // Start login
    await act(async () => {
      void result.current.handleVincentLogin();
    });

    // After login initiated, busy should be true
    expect(result.current.vincentLoginBusy).toBe(true);

    // Make status return connected on next poll
    mockVincentStatus.mockResolvedValue({
      connected: true,
      connectedAt: Date.now(),
    });

    // Advance timer by one poll interval (5s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.vincentLoginBusy).toBe(false);
    expect(result.current.vincentConnected).toBe(true);
    expect(result.current.vincentLoginError).toBeNull();
    expect(setActionNotice).toHaveBeenCalledWith(
      "Vincent connected",
      "success",
      5000,
    );
  });

  it("sets timeout error after maxPollAttempts (24) without connection", async () => {
    const setActionNotice = vi.fn();
    const t = (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? key;

    // Status never becomes connected
    mockVincentStatus.mockResolvedValue({
      connected: false,
      connectedAt: null,
    });

    const { result } = renderHook(() =>
      useVincentState({ setActionNotice, t }),
    );

    await act(async () => {
      void result.current.handleVincentLogin();
    });

    expect(result.current.vincentLoginBusy).toBe(true);

    // Advance through all 24 poll intervals (24 * 5000ms = 120000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 5000);
    });

    expect(result.current.vincentLoginBusy).toBe(false);
    expect(result.current.vincentLoginError).toBe(
      "Login timed out. Close the auth window and try again.",
    );
    expect(result.current.vincentConnected).toBe(false);
  });
});
