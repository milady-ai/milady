// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => {
  const handlers = new Map<
    string,
    Set<(payload: Record<string, unknown>) => void>
  >();

  return {
    mockClient: {
      getSignalStatus: vi.fn(),
      startSignalPairing: vi.fn(),
      stopSignalPairing: vi.fn(),
      disconnectSignal: vi.fn(),
      onWsEvent: vi.fn(
        (type: string, handler: (payload: Record<string, unknown>) => void) => {
          if (!handlers.has(type)) {
            handlers.set(type, new Set());
          }
          handlers.get(type)?.add(handler);
          return () => handlers.get(type)?.delete(handler);
        },
      ),
      emit(type: string, payload: Record<string, unknown>) {
        for (const handler of handlers.get(type) ?? []) {
          handler(payload);
        }
      },
      resetHandlers() {
        handlers.clear();
      },
    },
  };
});

vi.mock("../api/client", () => ({
  client: mockClient,
}));

import { useSignalPairing } from "./useSignalPairing";

describe("useSignalPairing", () => {
  beforeEach(() => {
    mockClient.getSignalStatus.mockReset();
    mockClient.startSignalPairing.mockReset();
    mockClient.stopSignalPairing.mockReset();
    mockClient.disconnectSignal.mockReset();
    mockClient.onWsEvent.mockClear();
    mockClient.resetHandlers();
    mockClient.getSignalStatus.mockResolvedValue({
      accountId: "default",
      status: "idle",
      authExists: false,
      serviceConnected: false,
    });
  });

  it("marks the connector connected when saved auth already exists", async () => {
    mockClient.getSignalStatus.mockResolvedValue({
      accountId: "default",
      status: "idle",
      authExists: true,
      serviceConnected: false,
    });

    const { result } = renderHook(() => useSignalPairing());

    await waitFor(() => expect(result.current.status).toBe("connected"));
  });

  it("reacts to QR and status websocket events", async () => {
    const { result } = renderHook(() => useSignalPairing());

    await waitFor(() => expect(mockClient.onWsEvent).toHaveBeenCalledTimes(2));

    act(() => {
      mockClient.emit("signal-qr", {
        accountId: "default",
        qrDataUrl: "data:image/png;base64,qr",
      });
    });

    expect(result.current.status).toBe("waiting_for_qr");
    expect(result.current.qrDataUrl).toBe("data:image/png;base64,qr");

    act(() => {
      mockClient.emit("signal-status", {
        accountId: "default",
        status: "connected",
        phoneNumber: "+15551234567",
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.qrDataUrl).toBeNull();
    expect(result.current.phoneNumber).toBe("+15551234567");
  });

  it("starts, stops, and disconnects through the client", async () => {
    mockClient.startSignalPairing.mockResolvedValue({
      ok: true,
      accountId: "default",
      status: "initializing",
    });
    mockClient.stopSignalPairing.mockResolvedValue({
      ok: true,
      accountId: "default",
      status: "idle",
    });
    mockClient.disconnectSignal.mockResolvedValue({
      ok: true,
      accountId: "default",
    });

    const { result } = renderHook(() => useSignalPairing());

    await act(async () => {
      await result.current.startPairing();
    });
    expect(mockClient.startSignalPairing).toHaveBeenCalledWith("default");

    await act(async () => {
      await result.current.stopPairing();
    });
    expect(mockClient.stopSignalPairing).toHaveBeenCalledWith("default");
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.disconnect();
    });
    expect(mockClient.disconnectSignal).toHaveBeenCalledWith("default");
    expect(result.current.status).toBe("idle");
  });
});
