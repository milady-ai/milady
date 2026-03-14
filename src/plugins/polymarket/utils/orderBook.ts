/**
 * Order Book Utility Functions
 *
 * Provides helpers for parsing, normalizing, and fetching order book data
 * from the Polymarket CLOB API.
 */

import { type IAgentRuntime, type State } from "@elizaos/core";
import type { OrderBookSummary } from "@polymarket/clob-client";
import type { BookEntry } from "../types";
import { initializeClobClient } from "./clobClient";
import { callLLMWithTimeout, isLLMError } from "./llmHelpers";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Response structure from LLM when extracting a single token ID.
 */
export interface LLMTokenResult {
  tokenId?: string;
  error?: string;
}

/**
 * Response structure from LLM when extracting multiple token IDs.
 */
export interface LLMTokensResult {
  tokenIds?: string[];
  error?: string;
}

/**
 * Supported order book metrics:
 * - "summary": Full order book snapshot with top bids/asks, spread, midpoint
 * - "bestPrice": Top-of-book price for a given side
 * - "midpoint": Midpoint between best bid and best ask
 * - "spread": Difference between best ask and best bid
 */
export type OrderBookMetric = "summary" | "bestPrice" | "midpoint" | "spread";

/**
 * Order book side identifiers:
 * - "buy" / "ask": The price at which you can buy (lowest ask)
 * - "sell" / "bid": The price at which you can sell (highest bid)
 */
export type BestPriceSide = "buy" | "sell" | "bid" | "ask";

/**
 * Options for order book queries parsed from action parameters.
 */
export interface OrderBookOptions {
  metric?: OrderBookMetric;
  side?: BestPriceSide;
  tokenId?: string;
  tokenIds?: string[];
}

// =============================================================================
// Parameter Parsing
// =============================================================================

/**
 * Parses action parameters into strongly-typed order book options.
 *
 * @param parameters - Raw action parameters object
 * @returns Parsed OrderBookOptions with validated fields
 */
export function parseOrderBookParameters(parameters?: Record<string, unknown>): OrderBookOptions {
  if (!parameters) {
    return {};
  }
  const metric = typeof parameters.metric === "string" ? normalizeMetric(parameters.metric) : null;
  const side = typeof parameters.side === "string" ? normalizeSide(parameters.side) : null;
  const tokenId = typeof parameters.tokenId === "string" ? parameters.tokenId : undefined;
  const tokenIds = Array.isArray(parameters.tokenIds)
    ? parameters.tokenIds.filter((value) => typeof value === "string")
    : undefined;

  return {
    metric: metric ?? undefined,
    side: side ?? undefined,
    tokenId,
    tokenIds,
  };
}

// =============================================================================
// Metric Normalization
// =============================================================================

/**
 * Normalizes a metric string to a valid OrderBookMetric enum value.
 *
 * @param metric - Raw metric string from user input
 * @returns Normalized OrderBookMetric or null if invalid
 *
 * @example
 * normalizeMetric("best_price") // returns "bestPrice"
 * normalizeMetric("SPREAD")     // returns "spread"
 * normalizeMetric("invalid")    // returns null
 */
export function normalizeMetric(metric?: string): OrderBookMetric | null {
  if (!metric) {
    return null;
  }
  const normalized = metric.trim().toLowerCase();
  if (normalized === "summary") {
    return "summary";
  }
  if (normalized === "bestprice" || normalized === "best_price" || normalized === "best price") {
    return "bestPrice";
  }
  if (normalized === "midpoint" || normalized === "mid") {
    return "midpoint";
  }
  if (normalized === "spread") {
    return "spread";
  }
  return null;
}

/**
 * Infers the intended metric from natural language text.
 * Falls back to "summary" if no specific metric is detected.
 *
 * @param text - Natural language query text
 * @returns Inferred OrderBookMetric
 *
 * @example
 * inferMetricFromText("what's the spread?")      // returns "spread"
 * inferMetricFromText("show me the order book")  // returns "summary"
 */
export function inferMetricFromText(text?: string): OrderBookMetric {
  if (!text) {
    return "summary";
  }
  const normalized = text.toLowerCase();
  if (normalized.includes("spread")) {
    return "spread";
  }
  if (normalized.includes("midpoint") || normalized.includes("midpoint price")) {
    return "midpoint";
  }
  if (
    normalized.includes("best price") ||
    normalized.includes("best bid") ||
    normalized.includes("best ask")
  ) {
    return "bestPrice";
  }
  if (normalized.includes("bid price") || normalized.includes("ask price")) {
    return "bestPrice";
  }
  return "summary";
}

// =============================================================================
// Side Normalization
// =============================================================================

/**
 * Normalizes a side string to a valid BestPriceSide enum value.
 *
 * @param side - Raw side string from user input
 * @returns Normalized BestPriceSide or null if invalid
 *
 * @example
 * normalizeSide("BUY")  // returns "buy"
 * normalizeSide("Ask")  // returns "ask"
 */
export function normalizeSide(side?: string): BestPriceSide | null {
  if (!side) {
    return null;
  }
  const normalized = side.trim().toLowerCase();
  if (
    normalized === "buy" ||
    normalized === "sell" ||
    normalized === "bid" ||
    normalized === "ask"
  ) {
    return normalized;
  }
  return null;
}

/**
 * Infers the intended side from natural language text.
 * Falls back to "buy" if no specific side is detected.
 *
 * @param text - Natural language query text
 * @returns Inferred BestPriceSide
 *
 * @example
 * inferSideFromText("what's the best bid?")  // returns "sell" (bid = sell side)
 * inferSideFromText("show ask price")        // returns "buy" (ask = buy side)
 */
export function inferSideFromText(text?: string): BestPriceSide {
  if (!text) {
    return "buy";
  }
  const normalized = text.toLowerCase();
  if (normalized.includes("bid") || normalized.includes("sell")) {
    return "sell";
  }
  if (normalized.includes("ask") || normalized.includes("buy")) {
    return "buy";
  }
  return "buy";
}

// =============================================================================
// LLM Token Resolution
// =============================================================================

/**
 * Resolves a token ID from conversation context using LLM extraction.
 *
 * Use this when the token ID is not explicitly provided in action parameters
 * and needs to be inferred from the user's message or conversation state.
 *
 * @param runtime - Agent runtime for LLM access
 * @param state - Current conversation state
 * @param template - Prompt template for token extraction
 * @param actionName - Name of the calling action (for logging)
 * @returns LLMTokenResult with tokenId or error
 */
export async function resolveTokenIdFromLLM(
  runtime: IAgentRuntime,
  state: State | undefined,
  template: string,
  actionName: string
): Promise<LLMTokenResult> {
  const result = await callLLMWithTimeout<LLMTokenResult>(runtime, state, template, actionName);
  const llmResult = result && !isLLMError(result) ? result : {};
  runtime.logger.info(`[${actionName}] LLM result: ${JSON.stringify(llmResult)}`);
  return llmResult;
}

// =============================================================================
// Order Book Fetching
// =============================================================================

/**
 * Fetches the order book summary for a single token from the CLOB API.
 *
 * @param runtime - Agent runtime for client initialization
 * @param tokenId - Polymarket condition token ID
 * @returns OrderBookSummary with bids and asks
 *
 * @example
 * const orderBook = await fetchOrderBookSummary(runtime, "12345...");
 * console.log(orderBook.bids[0].price); // Best bid price
 */
export async function fetchOrderBookSummary(
  runtime: IAgentRuntime,
  tokenId: string
): Promise<OrderBookSummary> {
  const client = await initializeClobClient(runtime);
  return client.getOrderBook(tokenId);
}

// =============================================================================
// Best Price Derivation
// =============================================================================

export interface BestPrice {
  price: number;
  size: string;
}

/**
 * Derive best bid (highest price) across all bid levels.
 * Handles unsorted arrays and filters invalid prices.
 */
export function deriveBestBid(bids: BookEntry[]): BestPrice | null {
  let best: BestPrice | null = null;

  for (const level of bids) {
    const price = parseFloat(level.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (best === null || price > best.price) {
      best = { price, size: level.size };
    }
  }

  return best;
}

/**
 * Derive best ask (lowest price) across all ask levels.
 * Handles unsorted arrays and filters invalid prices.
 */
export function deriveBestAsk(asks: BookEntry[]): BestPrice | null {
  let best: BestPrice | null = null;

  for (const level of asks) {
    const price = parseFloat(level.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (best === null || price < best.price) {
      best = { price, size: level.size };
    }
  }

  return best;
}

// =============================================================================
// Tick Size & Order Book Metadata
// =============================================================================

/**
 * Round a price to the nearest valid tick size.
 * Polymarket markets have variable tick sizes (0.01, 0.001, 0.0001).
 * The tick_size is returned in the GET /book response.
 */
export function roundToTickSize(price: number, tickSize: string | undefined): number {
  const tick = parseFloat(tickSize || "0");
  const effectiveTick = tick > 0 ? tick : 0.01;
  // Determine decimal places from the tick size to avoid floating point drift
  const tickStr = effectiveTick.toString();
  const decimalIndex = tickStr.indexOf(".");
  const decimals = decimalIndex === -1 ? 0 : tickStr.length - decimalIndex - 1;
  const rounded = Math.round(price / effectiveTick) * effectiveTick;
  return parseFloat(rounded.toFixed(decimals));
}

/**
 * Metadata parsed from the full CLOB order book response.
 */
export interface OrderBookMeta {
  tickSize: string;
  minOrderSize: string;
  negRisk: boolean;
  lastTradePrice: string | null;
}

/**
 * Extract metadata from raw order book API response.
 * The GET /book endpoint returns tick_size, min_order_size, neg_risk,
 * and last_trade_price alongside bids/asks.
 */
export function parseOrderBookMetadata(raw: Record<string, unknown>): OrderBookMeta {
  return {
    tickSize: typeof raw.tick_size === "string" && raw.tick_size ? raw.tick_size : "0.01",
    minOrderSize: typeof raw.min_order_size === "string" && raw.min_order_size ? raw.min_order_size : "1",
    negRisk: raw.neg_risk === true,
    lastTradePrice: typeof raw.last_trade_price === "string" ? raw.last_trade_price : null,
  };
}
