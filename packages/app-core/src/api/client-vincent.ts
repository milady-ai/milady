/**
 * Vincent domain methods — OAuth registration, token exchange, status, disconnect.
 */

import { MiladyClient } from "./client-base";

// ── Types ─────────────────────────────────────────────────────────────

export interface VincentStatusResponse {
  connected: boolean;
  connectedAt: number | null;
}

// ── Declaration merging ───────────────────────────────────────────────

declare module "./client-base" {
  interface MiladyClient {
    vincentRegister(
      appName: string,
      redirectUris: string[],
    ): Promise<{ client_id: string }>;
    vincentExchangeToken(
      code: string,
      clientId: string,
      codeVerifier: string,
    ): Promise<{ ok: boolean; connected: boolean }>;
    vincentStatus(): Promise<VincentStatusResponse>;
    vincentDisconnect(): Promise<{ ok: boolean }>;
  }
}

// ── Implementation ────────────────────────────────────────────────────

MiladyClient.prototype.vincentRegister = async function (
  appName: string,
  redirectUris: string[],
) {
  return this.fetch("/api/vincent/register", {
    method: "POST",
    body: JSON.stringify({ appName, redirectUris }),
  });
};

MiladyClient.prototype.vincentExchangeToken = async function (
  code: string,
  clientId: string,
  codeVerifier: string,
) {
  return this.fetch("/api/vincent/token", {
    method: "POST",
    body: JSON.stringify({ code, clientId, codeVerifier }),
  });
};

MiladyClient.prototype.vincentStatus = async function () {
  return this.fetch("/api/vincent/status");
};

MiladyClient.prototype.vincentDisconnect = async function () {
  return this.fetch("/api/vincent/disconnect", { method: "POST" });
};
