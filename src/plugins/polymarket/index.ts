import type { IAgentRuntime, Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";

import {
  cancelOrderAction,
  checkOrderScoringAction,
  closePositionAction,
  getBalanceAction,
  getOrderBookDepthAction,
  getOrderDetailsAction,
  getPositionsAction,
  getRewardsAction,
  getTokenInfoAction,
  getTradeHistoryAction,
  placeOrderAction,
  researchMarketAction,
  retrieveAllMarketsAction,
} from "./actions";
import { tradeRiskEvaluator } from "./evaluators";
import { polymarketProvider } from "./providers";
import { PolymarketService } from "./services";
import { researchTaskWorker } from "./workers";
import { initializeStores } from "./autonomous/stores/registry";
import { MAX_ACTIVE_THESES_DEFAULT } from "./constants";
export { initializeClobClient, initializeClobClientWithCreds, getWalletAddress } from "./utils/clobClient";
export type {
  AccountBalances,
  ApiKeyCreds,
  AuthenticationStatus,
  BalanceAllowance,
  CachedAccountState,
  Market,
  MarketResearch,
  MarketsResponse,
  OrderBook,
  OrderResponse,
  Position,
  ResearchRecommendation,
  ResearchResult,
  ResearchStatus,
  ResearchTaskMetadata,
  SimplifiedMarket,
  SimplifiedMarketsResponse,
  StartResearchParams,
  Token,
} from "./types";
export { ResearchStatus as ResearchStatusEnum } from "./types";
export { POLYGON_CHAIN_ID, DEFAULT_CLOB_API_URL, ACCOUNT_STATE_TTL_MS } from "./constants";
export { ResearchStorageService } from "./services";
export { getRewardsAction, getPositionsAction, getTradeHistoryAction, getBalanceAction } from "./actions";
export { researchTaskWorker, RESEARCH_TASK_NAME, TRADE_EVALUATION_TASK_NAME } from "./workers";
export { fetchUserPositions, fetchUserTotalValue, fetchUserTrades } from "./utils/dataApi";
export { roundToTickSize, parseOrderBookMetadata } from "./utils/orderBook";
export { DATA_API_URL } from "./constants";
export type { DataApiPosition, DataApiTrade, OrderBookSummary } from "./types";

const configSchema = z.object({
  CLOB_API_URL: z
    .string()
    .url("CLOB API URL must be a valid URL")
    .optional()
    .default("https://clob.polymarket.com"),
  POLYMARKET_PRIVATE_KEY: z.string().min(1, "Private key cannot be empty").optional(),
  // EVM_PRIVATE_KEY is in BLOCKED_ENV_KEYS (security) — read from process.env only, not UI config
  CLOB_API_KEY: z.string().min(1, "CLOB API key cannot be empty").optional(),
  CLOB_API_SECRET: z.string().min(1, "CLOB API secret cannot be empty").optional(),
  CLOB_API_PASSPHRASE: z.string().min(1, "CLOB API passphrase cannot be empty").optional(),
  POLYMARKET_SIGNATURE_TYPE: z.string().optional(),
  POLYMARKET_FUNDER_ADDRESS: z.string().optional(),
  POLYMARKET_ALLOW_CREATE_API_KEY: z.string().optional().default("true"),
  POLYMARKET_PROVIDER_STRICT: z.string().optional().default("true"),
  POLYMARKET_PROVIDER_CACHE_TTL_MS: z.string().optional(),
  // Keys from plugins.json that must be accepted during init()
  CLOB_WS_URL: z.string().optional(),
  POLYMARKET_MAX_POSITION_PCT: z.string().optional(),
  POLYMARKET_MAX_SPREAD_PCT: z.string().optional(),
  POLYMARKET_MAX_TRADE_SIZE_USD: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  POLYMARKET_AUTONOMOUS_ENABLED: z.string().optional().default("true"),
  POLYMARKET_AUTONOMOUS_TRADE_ENABLED: z.string().optional().default("true"),
  POLYMARKET_MAX_ACTIVE_THESES: z.string().optional(),
  POLYMARKET_MIN_TRADE_CONVICTION: z.string().optional(),
  POLYMARKET_CONVICTION_DECAY_THRESHOLD: z.string().optional(),
  POLYMARKET_REFLECTION_INTERVAL_MS: z.string().optional(),
  POLYMARKET_SCAN_INTERVAL_MS: z.string().optional(),
  POLYMARKET_MIN_TRADE_INTERVAL_MS: z.string().optional(),
  POLYMARKET_MAX_RESEARCH_PER_SCAN: z.string().optional(),
  POLYMARKET_SCAN_TIMEOUT_MS: z.string().optional(),
  POLYMARKET_BALANCE_RESERVE_PCT: z.string().optional(),
  POLYMARKET_MAX_DAILY_LOSS_USD: z.string().optional(),
}).passthrough();

export const polymarketPlugin: Plugin = {
  name: "polymarket",
  description: "Polymarket prediction markets integration plugin with deep research capabilities",
  config: {
    CLOB_API_URL: process.env.CLOB_API_URL,
    POLYMARKET_PRIVATE_KEY: process.env.POLYMARKET_PRIVATE_KEY,
    CLOB_API_KEY: process.env.CLOB_API_KEY,
    CLOB_API_SECRET: process.env.CLOB_API_SECRET,
    CLOB_API_PASSPHRASE: process.env.CLOB_API_PASSPHRASE,
    POLYMARKET_SIGNATURE_TYPE: process.env.POLYMARKET_SIGNATURE_TYPE,
    POLYMARKET_FUNDER_ADDRESS: process.env.POLYMARKET_FUNDER_ADDRESS,
    POLYMARKET_ALLOW_CREATE_API_KEY: process.env.POLYMARKET_ALLOW_CREATE_API_KEY,
    POLYMARKET_PROVIDER_STRICT: process.env.POLYMARKET_PROVIDER_STRICT,
    POLYMARKET_PROVIDER_CACHE_TTL_MS: process.env.POLYMARKET_PROVIDER_CACHE_TTL_MS,
    CLOB_WS_URL: process.env.CLOB_WS_URL,
    POLYMARKET_MAX_POSITION_PCT: process.env.POLYMARKET_MAX_POSITION_PCT,
    POLYMARKET_MAX_SPREAD_PCT: process.env.POLYMARKET_MAX_SPREAD_PCT,
    POLYMARKET_MAX_TRADE_SIZE_USD: process.env.POLYMARKET_MAX_TRADE_SIZE_USD,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    POLYMARKET_AUTONOMOUS_ENABLED: process.env.POLYMARKET_AUTONOMOUS_ENABLED,
    POLYMARKET_AUTONOMOUS_TRADE_ENABLED: process.env.POLYMARKET_AUTONOMOUS_TRADE_ENABLED,
    POLYMARKET_MAX_ACTIVE_THESES: process.env.POLYMARKET_MAX_ACTIVE_THESES,
    POLYMARKET_MIN_TRADE_CONVICTION: process.env.POLYMARKET_MIN_TRADE_CONVICTION,
    POLYMARKET_CONVICTION_DECAY_THRESHOLD: process.env.POLYMARKET_CONVICTION_DECAY_THRESHOLD,
    POLYMARKET_REFLECTION_INTERVAL_MS: process.env.POLYMARKET_REFLECTION_INTERVAL_MS,
    POLYMARKET_SCAN_INTERVAL_MS: process.env.POLYMARKET_SCAN_INTERVAL_MS,
    POLYMARKET_MIN_TRADE_INTERVAL_MS: process.env.POLYMARKET_MIN_TRADE_INTERVAL_MS,
    POLYMARKET_MAX_RESEARCH_PER_SCAN: process.env.POLYMARKET_MAX_RESEARCH_PER_SCAN,
    POLYMARKET_SCAN_TIMEOUT_MS: process.env.POLYMARKET_SCAN_TIMEOUT_MS,
    POLYMARKET_BALANCE_RESERVE_PCT: process.env.POLYMARKET_BALANCE_RESERVE_PCT,
    POLYMARKET_MAX_DAILY_LOSS_USD: process.env.POLYMARKET_MAX_DAILY_LOSS_USD,
  },
  async init(config: Record<string, string>, runtime?: IAgentRuntime) {
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      if (!validatedConfig.POLYMARKET_PRIVATE_KEY && !validatedConfig.EVM_PRIVATE_KEY) {
        logger.warn(
          "No private key configured (POLYMARKET_PRIVATE_KEY or EVM_PRIVATE_KEY). " +
            "Trading features will be disabled."
        );
      }

      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value && typeof value === "string") process.env[key] = value;
      }

      // Register the research task worker if runtime is available
      if (runtime) {
        runtime.registerTaskWorker(researchTaskWorker);
        logger.info("Polymarket research task worker registered");

        // Check if OpenAI is configured for research
        const openaiKey = runtime.getSetting("OPENAI_API_KEY");
        if (!openaiKey) {
          logger.warn(
            "OPENAI_API_KEY not configured. Deep research features will be unavailable."
          );
        }

        // Initialize autonomous trading stores (singleton registry)
        const maxTheses = parseInt(
          runtime.getSetting("POLYMARKET_MAX_ACTIVE_THESES") || String(MAX_ACTIVE_THESES_DEFAULT), 10
        );
        initializeStores({ maxActiveTheses: maxTheses });
        logger.info("Polymarket autonomous stores initialized");
      }

      logger.info("Polymarket plugin initialized successfully");
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid Polymarket plugin configuration: ${error.issues.map((e) => e.message).join(", ")}`
        );
      }
      throw error;
    }
  },
  services: [PolymarketService],
  providers: [polymarketProvider],
  actions: [
    // Market discovery & search (unified action using Gamma API)
    // Handles both keyword searches ("find miami heat") and category browsing ("show sports markets")
    retrieveAllMarketsAction,
    // Single-token comprehensive info (market details, pricing, price history, user position/orders)
    getTokenInfoAction,
    // Multi-token depth comparison
    getOrderBookDepthAction,
    // Trading
    placeOrderAction,
    // Order lookup
    getOrderDetailsAction,
    // Order scoring check (for specific/historical orders - active orders shown in provider)
    checkOrderScoringAction,
    // Deep market research
    researchMarketAction,
    // Cancel orders (all, per-token, or specific)
    cancelOrderAction,
    // Close/exit a position by selling all held shares
    closePositionAction,
    // Portfolio & rewards — on-demand query actions
    getRewardsAction,
    getPositionsAction,
    getTradeHistoryAction,
    getBalanceAction,
    // Note: Account state (balances, active orders, trades, positions, order scoring)
    // is automatically provided by polymarketProvider via the service's cached state.
    // This data refreshes on startup and every 30 minutes.
  ],
  evaluators: [tradeRiskEvaluator],
};

export default polymarketPlugin;
