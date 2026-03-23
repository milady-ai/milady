/**
 * Shared constants and helpers for wallet action handlers
 * (execute-trade, transfer-token, check-balance).
 */

/** API port for loopback wallet API calls. Shared across all wallet actions. */
export const WALLET_ACTION_API_PORT =
  process.env.MILADY_API_PORT || "31337";

/**
 * Build Authorization headers for loopback API calls.
 * Reads ELIZA_API_TOKEN from the environment and formats it as a Bearer token.
 * Returns an empty object when no token is configured.
 */
export function buildAuthHeaders(): Record<string, string> {
  const token = process.env.ELIZA_API_TOKEN?.trim();
  if (!token) return {};
  return {
    Authorization: /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`,
  };
}

function stripAuthorizationHeader(
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  if (!headers) return headers;
  const next = new Headers(headers);
  next.delete("authorization");
  next.delete("Authorization");
  return next;
}

/**
 * Fetch helper for local wallet actions.
 * Retries once without Authorization when a local loopback call is rejected
 * (401/403), which can happen when stale API tokens linger in env.
 */
export async function walletActionFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, init);
  const hasAuthHeader = new Headers(init.headers).has("Authorization");
  if (response.status !== 401 && response.status !== 403) {
    return response;
  }
  if (!hasAuthHeader) {
    return response;
  }
  const retryInit: RequestInit = {
    ...init,
    headers: stripAuthorizationHeader(init.headers),
  };
  return fetch(url, retryInit);
}
