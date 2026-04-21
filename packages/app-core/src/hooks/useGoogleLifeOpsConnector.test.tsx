// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_RESUME_EVENT,
  LIFEOPS_GOOGLE_CONNECTOR_REFRESH_EVENT,
} from "../events";

const { mockClient, mockOpenExternalUrl, mockUseApp } = vi.hoisted(() => ({
  mockClient: {
    disconnectGoogleLifeOpsConnector: vi.fn(),
    getBaseUrl: vi.fn(),
    getGoogleLifeOpsConnectorStatus: vi.fn(),
    selectGoogleLifeOpsConnectorMode: vi.fn(),
    startGoogleLifeOpsConnector: vi.fn(),
  },
  mockOpenExternalUrl: vi.fn(async () => {}),
  mockUseApp: vi.fn(),
}));

vi.mock("../api", () => ({
  client: mockClient,
}));

vi.mock("../utils", () => ({
  openExternalUrl: (...args: unknown[]) => mockOpenExternalUrl(...args),
}));

vi.mock("../state", () => ({
  useApp: () => mockUseApp(),
}));

import type {
  LifeOpsConnectorMode,
  LifeOpsConnectorSide,
  LifeOpsGoogleConnectorStatus,
} from "@miladyai/shared/contracts/lifeops";
import { useGoogleLifeOpsConnector } from "./useGoogleLifeOpsConnector";

function buildStatus(
  side: LifeOpsConnectorSide,
  overrides: Partial<LifeOpsGoogleConnectorStatus> = {},
): LifeOpsGoogleConnectorStatus {
  return {
    provider: "google",
    side,
    mode: "cloud_managed",
    defaultMode: "cloud_managed",
    availableModes: ["cloud_managed"],
    executionTarget: "cloud",
    sourceOfTruth: "cloud_connection",
    configured: true,
    connected: false,
    reason: "disconnected",
    preferredByAgent: false,
    cloudConnectionId: null,
    identity: null,
    grantedCapabilities: [],
    grantedScopes: [],
    expiresAt: null,
    hasRefreshToken: false,
    grant: null,
    ...overrides,
  };
}

describe("useGoogleLifeOpsConnector", () => {
  beforeEach(() => {
    mockClient.disconnectGoogleLifeOpsConnector.mockReset();
    mockClient.getBaseUrl.mockReset();
    mockClient.getGoogleLifeOpsConnectorStatus.mockReset();
    mockClient.selectGoogleLifeOpsConnectorMode.mockReset();
    mockClient.startGoogleLifeOpsConnector.mockReset();
    mockOpenExternalUrl.mockReset();
    mockUseApp.mockReset().mockReturnValue({
      startupPhase: "ready",
      agentStatus: { state: "running" },
      backendConnection: { state: "connected" },
    });
    mockClient.getBaseUrl.mockReturnValue("http://127.0.0.1:3000");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps managed and local modes visible for setup", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        availableModes: ["cloud_managed"],
      }),
    );

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.status).not.toBeNull());

    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledWith(
      undefined,
      "owner",
    );
    expect(result.current.modeOptions).toEqual(["cloud_managed", "local"]);
  });

  it("does not poll connector status before the runtime is ready", async () => {
    mockUseApp.mockReturnValue({
      startupPhase: "starting-backend",
      agentStatus: { state: "starting" },
      backendConnection: { state: "reconnecting" },
    });

    renderHook(() => useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.getGoogleLifeOpsConnectorStatus).not.toHaveBeenCalled();
  });

  it("previews local mode when it is not yet available to persist", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus
      .mockResolvedValueOnce(
        buildStatus("agent", {
          mode: "cloud_managed",
          availableModes: ["cloud_managed"],
        }),
      )
      .mockResolvedValueOnce(
        buildStatus("agent", {
          mode: "local",
          availableModes: ["cloud_managed"],
          executionTarget: "local",
          sourceOfTruth: "local_storage",
          configured: false,
          connected: false,
          reason: "config_missing",
        }),
      );

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000, side: "agent" }),
    );

    await waitFor(() =>
      expect(result.current.status?.mode).toBe("cloud_managed"),
    );

    await act(async () => {
      await result.current.selectMode("local");
    });

    expect(mockClient.selectGoogleLifeOpsConnectorMode).not.toHaveBeenCalled();
    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledWith(
      "local",
      "agent",
    );
    expect(result.current.activeMode).toBe("local");
    await waitFor(() =>
      expect(result.current.status?.reason).toBe("config_missing"),
    );
  });

  it("persists an available mode change and starts auth for the selected mode", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        availableModes: ["cloud_managed", "local"],
      }),
    );
    mockClient.selectGoogleLifeOpsConnectorMode.mockResolvedValue(
      buildStatus("owner", {
        mode: "local",
        availableModes: ["cloud_managed", "local"],
        executionTarget: "local",
        sourceOfTruth: "local_storage",
        configured: true,
      }),
    );
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      mode: "local" as LifeOpsConnectorMode,
      requestedCapabilities: ["google.basic_identity"],
      redirectUri:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/callback",
      authUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=desktop-client",
    });

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({ pollIntervalMs: 60_000 }),
    );

    await waitFor(() => expect(result.current.status).not.toBeNull());

    await act(async () => {
      await result.current.selectMode("local");
    });

    expect(mockClient.selectGoogleLifeOpsConnectorMode).toHaveBeenCalledWith({
      mode: "local",
      side: "owner",
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      mode: "local",
      side: "owner",
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=desktop-client",
    );
  });

  it("passes a Milady success redirect when starting managed auth", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("agent", {
        mode: "cloud_managed",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed", "local"],
      }),
    );
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      side: "agent",
      mode: "cloud_managed" as LifeOpsConnectorMode,
      requestedCapabilities: ["google.basic_identity"],
      redirectUri:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=agent&mode=cloud_managed",
      authUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=managed-client",
    });

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 60_000,
        side: "agent",
      }),
    );

    await waitFor(() =>
      expect(result.current.status?.mode).toBe("cloud_managed"),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      mode: "cloud_managed",
      redirectUrl:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=agent&mode=cloud_managed",
      side: "agent",
    });
    expect(mockOpenExternalUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=managed-client",
    );
  });

  it("prefers cloud-managed connect when the current local mode is missing config", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        mode: "local",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed", "local"],
        configured: false,
        connected: false,
        reason: "config_missing",
      }),
    );
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      side: "owner",
      mode: "cloud_managed" as LifeOpsConnectorMode,
      requestedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      redirectUri:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
      authUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=managed-client",
    });

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 60_000,
        side: "owner",
      }),
    );

    await waitFor(() =>
      expect(result.current.status?.reason).toBe("config_missing"),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      mode: "cloud_managed",
      redirectUrl:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
      side: "owner",
    });
  });

  it("requests the full LifeOps Google capability set when reconnecting", async () => {
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        mode: "cloud_managed",
        defaultMode: "cloud_managed",
        availableModes: ["cloud_managed", "local"],
        connected: true,
        reason: "needs_reauth",
        grantedCapabilities: [
          "google.basic_identity",
          "google.calendar.read",
          "google.gmail.triage",
        ],
      }),
    );
    mockClient.startGoogleLifeOpsConnector.mockResolvedValue({
      provider: "google",
      side: "owner",
      mode: "cloud_managed" as LifeOpsConnectorMode,
      requestedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      redirectUri:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
      authUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=managed-client",
    });

    const { result } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 60_000,
        side: "owner",
      }),
    );

    await waitFor(() =>
      expect(result.current.status?.reason).toBe("needs_reauth"),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(mockClient.startGoogleLifeOpsConnector).toHaveBeenCalledWith({
      capabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ],
      mode: "cloud_managed",
      redirectUrl:
        "http://127.0.0.1:3000/api/lifeops/connectors/google/success?side=owner&mode=cloud_managed",
      side: "owner",
    });
  });

  it("does not keep polling disconnected status when polling while disconnected is disabled", async () => {
    vi.useFakeTimers();
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        connected: false,
        reason: "disconnected",
      }),
    );

    const { unmount } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 10_000,
        pollWhileDisconnected: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("keeps polling connected status even when disconnected polling is disabled", async () => {
    vi.useFakeTimers();
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        connected: true,
        reason: "connected",
      }),
    );

    const { unmount } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 10_000,
        pollWhileDisconnected: false,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("refreshes when a Google connector refresh event targets the same side", async () => {
    vi.useFakeTimers();
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        connected: false,
        reason: "disconnected",
      }),
    );

    const { unmount } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 60_000,
        pollWhileDisconnected: false,
        side: "owner",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const initialCalls =
      mockClient.getGoogleLifeOpsConnectorStatus.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(LIFEOPS_GOOGLE_CONNECTOR_REFRESH_EVENT, {
          detail: {
            side: "owner",
            mode: "cloud_managed",
            source: "callback",
          },
        }),
      );
      await Promise.resolve();
    });

    expect(
      mockClient.getGoogleLifeOpsConnectorStatus.mock.calls.length,
    ).toBeGreaterThan(initialCalls);
    expect(mockClient.getGoogleLifeOpsConnectorStatus).toHaveBeenLastCalledWith(
      "cloud_managed",
      "owner",
    );
    unmount();
  });

  it("refreshes on focus and app resume even when disconnected polling is disabled", async () => {
    vi.useFakeTimers();
    mockClient.getGoogleLifeOpsConnectorStatus.mockResolvedValue(
      buildStatus("owner", {
        connected: false,
        reason: "disconnected",
      }),
    );

    const { unmount } = renderHook(() =>
      useGoogleLifeOpsConnector({
        pollIntervalMs: 60_000,
        pollWhileDisconnected: false,
        side: "owner",
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    const initialCalls =
      mockClient.getGoogleLifeOpsConnectorStatus.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event(APP_RESUME_EVENT));
      await Promise.resolve();
    });

    expect(
      mockClient.getGoogleLifeOpsConnectorStatus.mock.calls.length,
    ).toBeGreaterThanOrEqual(initialCalls + 2);
    unmount();
  });
});
