// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockVincentStatus = vi.fn();
const mockVincentRegister = vi.fn();
const mockVincentExchangeToken = vi.fn();
const mockVincentDisconnect = vi.fn();

vi.mock("../api", () => ({
  client: {
    vincentStatus: (...args: unknown[]) => mockVincentStatus(...args),
    vincentRegister: (...args: unknown[]) => mockVincentRegister(...args),
    vincentExchangeToken: (...args: unknown[]) =>
      mockVincentExchangeToken(...args),
    vincentDisconnect: (...args: unknown[]) => mockVincentDisconnect(...args),
  },
}));

vi.mock("../api/vincent-oauth", () => ({
  buildVincentAuthUrl: vi.fn().mockResolvedValue({
    url: "https://heyvincent.ai/auth?client_id=test",
    codeVerifier: "test-verifier",
  }),
  clearCodeVerifier: vi.fn(),
  getStoredClientId: vi.fn().mockReturnValue(null),
  getStoredCodeVerifier: vi.fn().mockReturnValue(null),
  getVincentRedirectUri: vi
    .fn()
    .mockReturnValue("http://localhost/callback/vincent"),
  storeClientId: vi.fn(),
  storeCodeVerifier: vi.fn(),
}));

vi.mock("../utils", () => ({
  openExternalUrl: vi.fn(),
}));

import { useVincentState } from "./useVincentState";

describe("useVincentState — handleVincentLogin poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVincentStatus.mockResolvedValue({
      connected: false,
      connectedAt: null,
    });
    mockVincentRegister.mockResolvedValue({ client_id: "test-client-id" });
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
