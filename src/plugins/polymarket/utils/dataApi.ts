import type { IAgentRuntime } from "@elizaos/core";
import { DATA_API_URL } from "../constants";
import type { DataApiPosition, DataApiTrade } from "../types";

/**
 * Fetch current positions for a user from the Data API.
 * This is the authoritative source for positions — more reliable than
 * reconstructing from CLOB trade history.
 *
 * Endpoint: GET https://data-api.polymarket.com/positions?user={address}
 * Auth: None (public)
 */
export async function fetchUserPositions(
  runtime: IAgentRuntime,
  userAddress: string
): Promise<DataApiPosition[]> {
  const url = `${DATA_API_URL}/positions?user=${userAddress}`;
  runtime.logger.debug(`[dataApi] Fetching positions: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Positions fetch failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as DataApiPosition[];
    if (!Array.isArray(data)) {
      runtime.logger.warn("[dataApi] Positions response is not an array");
      return [];
    }

    // Filter out zero-size positions
    return data.filter((p) => p.size !== 0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Positions fetch error: ${msg}`);
    return [];
  }
}

/**
 * Fetch total position value for a user from the Data API.
 *
 * Endpoint: GET https://data-api.polymarket.com/value?user={address}
 * Auth: None (public)
 */
export async function fetchUserTotalValue(
  runtime: IAgentRuntime,
  userAddress: string
): Promise<number> {
  const url = `${DATA_API_URL}/value?user=${userAddress}`;
  runtime.logger.debug(`[dataApi] Fetching total value: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Value fetch failed: ${response.status}`);
      return 0;
    }

    const data = (await response.json()) as { total_value?: string };
    const value = parseFloat(data.total_value ?? "0");
    return Number.isFinite(value) ? value : 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Value fetch error: ${msg}`);
    return 0;
  }
}

/**
 * Fetch recent trades for a user from the Data API.
 *
 * Endpoint: GET https://data-api.polymarket.com/trades?user={address}
 * Auth: None (public)
 */
export async function fetchUserTrades(
  runtime: IAgentRuntime,
  userAddress: string,
  options?: { limit?: number; market?: string }
): Promise<DataApiTrade[]> {
  const params = new URLSearchParams({ user: userAddress });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.market) params.set("market", options.market);

  const url = `${DATA_API_URL}/trades?${params.toString()}`;
  runtime.logger.debug(`[dataApi] Fetching trades: ${url}`);

  try {
    const response = await runtime.fetch(url);
    if (!response.ok) {
      runtime.logger.warn(`[dataApi] Trades fetch failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as DataApiTrade[];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    runtime.logger.error(`[dataApi] Trades fetch error: ${msg}`);
    return [];
  }
}
