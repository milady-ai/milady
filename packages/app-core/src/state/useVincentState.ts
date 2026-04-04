/**
 * Vincent OAuth state — manages connect/disconnect flow for the wallet UI.
 *
 * Follows the same pattern as useCloudState:
 * - Browser-based OAuth flow (opens Vincent authorize URL)
 * - Polls /api/vincent/status after redirect
 * - Exposes connected/busy/error state for the UI
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../api";
import {
  buildVincentAuthUrl,
  clearCodeVerifier,
  getStoredClientId,
  getStoredCodeVerifier,
  getVincentRedirectUri,
  storeClientId,
  storeCodeVerifier,
} from "../api/vincent-oauth";
import { openExternalUrl } from "../utils";

interface VincentStateParams {
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export function useVincentState({ setActionNotice, t }: VincentStateParams) {
  const [vincentConnected, setVincentConnected] = useState(false);
  const [vincentLoginBusy, setVincentLoginBusy] = useState(false);
  const [vincentLoginError, setVincentLoginError] = useState<string | null>(
    null,
  );
  const [vincentConnectedAt, setVincentConnectedAt] = useState<number | null>(
    null,
  );
  const busyRef = useRef(false);
  const loginPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll status on mount ────────────────────────────────────────
  const pollVincentStatus = useCallback(async () => {
    try {
      const status = await client.vincentStatus();
      setVincentConnected(status.connected);
      setVincentConnectedAt(status.connectedAt);
      return status.connected;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void pollVincentStatus();
    return () => {
      if (loginPollRef.current) {
        clearInterval(loginPollRef.current);
        loginPollRef.current = null;
      }
    };
  }, [pollVincentStatus]);

  // ── Handle callback (code in URL) ──────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code || !url.pathname.endsWith("/callback/vincent")) return;

    const codeVerifier = getStoredCodeVerifier();
    const clientId = getStoredClientId();
    if (!codeVerifier || !clientId) return;

    // Clean URL
    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, url.pathname);

    setVincentLoginBusy(true);
    client
      .vincentExchangeToken(code, clientId, codeVerifier)
      .then((result) => {
        clearCodeVerifier();
        if (result.connected) {
          setVincentConnected(true);
          setVincentLoginError(null);
          setActionNotice(
            t("vincent.connected", { defaultValue: "Vincent connected" }),
            "success",
            5000,
          );
        }
      })
      .catch((err) => {
        setVincentLoginError(
          err instanceof Error ? err.message : "Token exchange failed",
        );
      })
      .finally(() => {
        setVincentLoginBusy(false);
        busyRef.current = false;
      });
  }, [setActionNotice, t]);

  // ── Login flow ──────────────────────────────────────────────────
  const handleVincentLogin = useCallback(async () => {
    if (vincentConnected || busyRef.current || vincentLoginBusy) return;
    busyRef.current = true;
    setVincentLoginBusy(true);
    setVincentLoginError(null);

    try {
      const redirectUri = getVincentRedirectUri();

      // Step 1: Register app
      const { client_id } = await client.vincentRegister("Milady", [
        redirectUri,
      ]);
      storeClientId(client_id);

      // Step 2: Build PKCE auth URL
      const { url, codeVerifier } = await buildVincentAuthUrl(
        client_id,
        redirectUri,
      );
      storeCodeVerifier(codeVerifier);

      // Step 3: Open browser
      openExternalUrl(url);

      // Poll for connection status — handles desktop apps where the OAuth
      // callback may be processed server-side instead of via URL redirect.
      // Also acts as a fallback if the user closes the auth window.
      if (loginPollRef.current) clearInterval(loginPollRef.current);
      let pollAttempts = 0;
      const maxPollAttempts = 24; // ~2 minutes at 5s intervals
      loginPollRef.current = setInterval(async () => {
        pollAttempts++;
        try {
          const connected = await pollVincentStatus();
          if (connected) {
            if (loginPollRef.current) clearInterval(loginPollRef.current);
            loginPollRef.current = null;
            setVincentLoginBusy(false);
            busyRef.current = false;
            setVincentLoginError(null);
            setActionNotice(
              t("vincent.connected", { defaultValue: "Vincent connected" }),
              "success",
              5000,
            );
            return;
          }
        } catch {
          // ignore poll errors
        }
        if (pollAttempts >= maxPollAttempts) {
          if (loginPollRef.current) clearInterval(loginPollRef.current);
          loginPollRef.current = null;
          setVincentLoginBusy(false);
          busyRef.current = false;
          setVincentLoginError(
            t("vincent.loginTimeout", {
              defaultValue:
                "Login timed out. Close the auth window and try again.",
            }),
          );
        }
      }, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Vincent login failed";
      setVincentLoginError(msg);
      setVincentLoginBusy(false);
      busyRef.current = false;
    }
  }, [vincentConnected, vincentLoginBusy]);

  // ── Disconnect ──────────────────────────────────────────────────
  const handleVincentDisconnect = useCallback(async () => {
    try {
      await client.vincentDisconnect();
      setVincentConnected(false);
      setVincentConnectedAt(null);
      setVincentLoginError(null);
      clearCodeVerifier();
      setActionNotice(
        t("vincent.disconnected", { defaultValue: "Vincent disconnected" }),
        "info",
        3000,
      );
    } catch (err) {
      setVincentLoginError(
        err instanceof Error ? err.message : "Disconnect failed",
      );
    }
  }, [setActionNotice, t]);

  return {
    vincentConnected,
    vincentLoginBusy,
    vincentLoginError,
    vincentConnectedAt,
    handleVincentLogin,
    handleVincentDisconnect,
    pollVincentStatus,
  };
}
