/**
 * API Base Resolution for Electrobun
 *
 * Resolves the external API base URL from environment variables and provides
 * utilities to inject it into the webview via RPC messages.
 */

import { DEFAULT_PORT } from "./constants";

type ExternalApiBaseEnvKey =
  | "MILADY_DESKTOP_TEST_API_BASE"
  | "MILADY_DESKTOP_API_BASE"
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE";

export type DesktopRuntimeMode = "local" | "external" | "disabled";

const EXTERNAL_API_BASE_ENV_KEYS: readonly ExternalApiBaseEnvKey[] = [
  "MILADY_DESKTOP_TEST_API_BASE",
  "MILADY_DESKTOP_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_BASE",
];

export interface ExternalApiBaseResolution {
  base: string | null;
  source: ExternalApiBaseEnvKey | null;
  invalidSources: ExternalApiBaseEnvKey[];
}

export interface DesktopRuntimeModeResolution {
  mode: DesktopRuntimeMode;
  externalApi: ExternalApiBaseResolution;
}

export function normalizeApiBase(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveExternalApiBase(
  env: Record<string, string | undefined>,
): ExternalApiBaseResolution {
  const invalidSources: ExternalApiBaseEnvKey[] = [];

  for (const key of EXTERNAL_API_BASE_ENV_KEYS) {
    const rawValue = env[key]?.trim();
    if (!rawValue) continue;

    const normalized = normalizeApiBase(rawValue);
    if (normalized) {
      return { base: normalized, source: key, invalidSources };
    }
    invalidSources.push(key);
  }

  return { base: null, source: null, invalidSources };
}

function isEnabledFlag(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function resolveDesktopRuntimeMode(
  env: Record<string, string | undefined>,
): DesktopRuntimeModeResolution {
  const externalApi = resolveExternalApiBase(env);
  if (externalApi.base) {
    return { mode: "external", externalApi };
  }

  if (isEnabledFlag(env.MILADY_DESKTOP_SKIP_EMBEDDED_AGENT)) {
    return { mode: "disabled", externalApi };
  }

  return { mode: "local", externalApi };
}

export function resolveInitialApiBase(
  env: Record<string, string | undefined>,
): string | null {
  const resolution = resolveDesktopRuntimeMode(env);
  if (resolution.mode === "external") {
    return resolution.externalApi.base;
  }

  const agentPort = Number(env.MILADY_PORT) || DEFAULT_PORT;
  return `http://127.0.0.1:${agentPort}`;
}

/** True when the hostname is a loopback we treat as same-trust as 127.0.0.1. */
function isLoopbackHttpHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

/**
 * When the desktop loads the UI from a local http(s) dev server (Vite), the
 * renderer must call `/api` on **that origin** so requests stay same-origin and
 * the Vite proxy reaches the embedded agent. Pushing `http://127.0.0.1:<apiPort>`
 * instead breaks WKWebView (cross-origin + missing/weird `Origin`).
 *
 * Returns `null` when no dev URL is set or it is not a loopback http(s) origin.
 */
export function resolveHttpLoopbackRendererOriginForApiClient(
  env: Record<string, string | undefined>,
): string | null {
  const raw =
    env.MILADY_RENDERER_URL?.trim() || env.VITE_DEV_SERVER_URL?.trim() || "";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!isLoopbackHttpHostname(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Base URL the **renderer** should use for `MiladyClient` (REST + WebSocket URL
 * derivation). This is not always the same as “where the agent listens.”
 *
 * **Why prefer Vite origin in watch:** The webview document is loaded from
 * `MILADY_RENDERER_URL` (e.g. `http://127.0.0.1:2138`). If we injected the API
 * port (`:31337`) as `__MILADY_API_BASE__`, every request would be cross-origin.
 * WKWebView enforces CORS and may omit `Origin`, so responses without
 * `Access-Control-Allow-Origin` fail. Same-origin `/api` on the Vite host uses the
 * existing dev proxy — no duplicate HTTP server.
 *
 * **Why fall back to `127.0.0.1:<port>`:** Static server, `file:`, or no dev URL —
 * the UI must talk to the embedded agent directly. **External** mode bypasses
 * this helper at call sites that only push env-configured bases.
 */
export function resolveRendererFacingApiBase(
  env: Record<string, string | undefined>,
  apiListenPort: number,
): string {
  const fromDevServer = resolveHttpLoopbackRendererOriginForApiClient(env);
  if (fromDevServer) return fromDevServer;
  return `http://127.0.0.1:${apiListenPort}`;
}

/**
 * Push the API base URL (and optional token) to the renderer via typed
 * RPC message instead of evaluating arbitrary JS (CSP-safe).
 *
 * The renderer-side bridge registers a handler for `apiBaseUpdate`
 * that writes the values to `window.__MILADY_API_BASE__` and
 * `window.__MILADY_API_TOKEN__`.
 */
/**
 * Structural type for the send proxy on an Electrobun RPC instance.
 * Scoped to only the message this module needs to send.
 */
type ApiBaseUpdateRpc = {
  send?: {
    apiBaseUpdate?: (payload: { base: string; token?: string }) => void;
  };
};

export function pushApiBaseToRenderer(
  win: { webview: { rpc?: unknown } },
  base: string,
  apiToken?: string,
): void {
  const trimmedToken = apiToken?.trim();
  const payload = { base, token: trimmedToken || undefined };
  try {
    const rpcSend = (win.webview?.rpc as ApiBaseUpdateRpc | undefined)?.send;
    rpcSend?.apiBaseUpdate?.(payload);
  } catch (err) {
    console.warn(`[ApiBase] Push failed:`, err);
  }
}
