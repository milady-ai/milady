/**
 * Security / auth helpers — WebSocket upgrade rejection, terminal run
 * rejection, MCP terminal authorization, API token binding, and
 * Hyperscape authorization header resolution.
 */
import type http from "node:http";
import {
  ensureApiTokenForBindHost as upstreamEnsureApiTokenForBindHost,
  resolveMcpTerminalAuthorizationRejection as upstreamResolveMcpTerminalAuthorizationRejection,
  resolveTerminalRunClientId as upstreamResolveTerminalRunClientId,
  resolveTerminalRunRejection as upstreamResolveTerminalRunRejection,
  resolveWebSocketUpgradeRejection as upstreamResolveWebSocketUpgradeRejection,
} from "@miladyai/agent/api/server";
import { syncMiladyEnvToEliza, syncElizaEnvToMilady } from "../utils/env.js";

import {
  normalizeCompatRejection,
  runWithCompatAuthContext,
} from "./server-wallet-trade";

export function resolveMcpTerminalAuthorizationRejection(
  ...args: Parameters<typeof upstreamResolveMcpTerminalAuthorizationRejection>
): ReturnType<typeof upstreamResolveMcpTerminalAuthorizationRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(
      upstreamResolveMcpTerminalAuthorizationRejection(...args),
    ),
  );
}

export function resolveTerminalRunRejection(
  ...args: Parameters<typeof upstreamResolveTerminalRunRejection>
): ReturnType<typeof upstreamResolveTerminalRunRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(upstreamResolveTerminalRunRejection(...args)),
  );
}

export function resolveWebSocketUpgradeRejection(
  ...args: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>
): ReturnType<typeof upstreamResolveWebSocketUpgradeRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    upstreamResolveWebSocketUpgradeRejection(...args),
  );
}

export function resolveTerminalRunClientId(
  ...args: Parameters<typeof upstreamResolveTerminalRunClientId>
): ReturnType<typeof upstreamResolveTerminalRunClientId> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    upstreamResolveTerminalRunClientId(...args),
  );
}

export function ensureApiTokenForBindHost(
  ...args: Parameters<typeof upstreamEnsureApiTokenForBindHost>
): ReturnType<typeof upstreamEnsureApiTokenForBindHost> {
  syncMiladyEnvToEliza();
  const result = upstreamEnsureApiTokenForBindHost(...args);
  syncElizaEnvToMilady();
  return result;
}

/**
 * Build the Authorization header value to use when forwarding requests to
 * Hyperscape. Returns `null` when no token is configured.
 *
 * - When `HYPERSCAPE_AUTH_TOKEN` is set, its value is used (prefixed with
 *   "Bearer " if not already present) regardless of any incoming header.
 * - When the env var is unset, returns `null` so callers know not to forward
 *   any credentials.
 */
export function resolveHyperscapeAuthorizationHeader(
  _req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const token = process.env.HYPERSCAPE_AUTH_TOKEN;
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}
