/**
 * Shared constants and helpers for wallet action handlers
 * (execute-trade, transfer-token, check-balance).
 *
 * @module actions/wallet-action-shared
 */

/** Resolve the loopback API port for wallet action calls at runtime. */
export function getWalletActionApiPort(): string {
  return (
    process.env.MILADY_API_PORT ||
    process.env.MILADY_PORT ||
    process.env.ELIZA_PORT ||
    process.env.API_PORT ||
    "31337"
  );
}

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
