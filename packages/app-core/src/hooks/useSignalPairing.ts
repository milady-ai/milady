import { useCallback, useEffect, useState } from "react";
import { client } from "../api/client";

export type { SignalPairingStatus } from "@miladyai/agent/services/signal-pairing";

import type { SignalPairingStatus } from "@miladyai/agent/services/signal-pairing";

interface SignalPairingState {
  status: SignalPairingStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  error: string | null;
}

export function useSignalPairing(accountId = "default") {
  const [state, setState] = useState<SignalPairingState>({
    status: "idle",
    qrDataUrl: null,
    phoneNumber: null,
    error: null,
  });

  useEffect(() => {
    client
      .getSignalStatus(accountId)
      .then((res) => {
        if (res.authExists) {
          setState((prev) => ({
            ...prev,
            status: "connected",
          }));
        }
      })
      .catch(() => {
        // Initial auth probe is best-effort.
      });
  }, [accountId]);

  useEffect(() => {
    const unbindQr = client.onWsEvent(
      "signal-qr",
      (data: Record<string, unknown>) => {
        if (data.accountId !== accountId) return;
        setState((prev) => ({
          ...prev,
          status: "waiting_for_qr",
          qrDataUrl: (data.qrDataUrl as string) ?? null,
          error: null,
        }));
      },
    );

    const unbindStatus = client.onWsEvent(
      "signal-status",
      (data: Record<string, unknown>) => {
        if (data.accountId !== accountId) return;
        setState((prev) => ({
          ...prev,
          status: data.status as SignalPairingStatus,
          phoneNumber: (data.phoneNumber as string) ?? prev.phoneNumber,
          error: (data.error as string) ?? null,
          qrDataUrl: data.status === "connected" ? null : prev.qrDataUrl,
        }));
      },
    );

    return () => {
      unbindQr();
      unbindStatus();
    };
  }, [accountId]);

  const startPairing = useCallback(async () => {
    setState({
      status: "initializing",
      qrDataUrl: null,
      phoneNumber: null,
      error: null,
    });

    try {
      const result = await client.startSignalPairing(accountId);
      if (!result.ok) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: result.error ?? "Failed to start Signal pairing",
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [accountId]);

  const stopPairing = useCallback(async () => {
    await client.stopSignalPairing(accountId).catch(() => {});
    setState({
      status: "idle",
      qrDataUrl: null,
      phoneNumber: null,
      error: null,
    });
  }, [accountId]);

  const disconnect = useCallback(async () => {
    await client.disconnectSignal(accountId).catch(() => {});
    setState({
      status: "idle",
      qrDataUrl: null,
      phoneNumber: null,
      error: null,
    });
  }, [accountId]);

  return { ...state, startPairing, stopPairing, disconnect };
}
