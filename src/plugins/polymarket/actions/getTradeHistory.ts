import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { DataApiTrade, TradeHistoryActivityData } from "../types";
import { getWalletAddress } from "../utils/clobClient";
import { fetchUserTrades } from "../utils/dataApi";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMTradeHistoryResult {
  limit?: number;
  market?: string;
  error?: string;
}

const getTradeHistoryTemplate = `You are an assistant extracting trade history query parameters from a user message.

Determine:
- limit: number of trades to show (default 20, max 100)
- market: condition_id if user asks about a specific market (null otherwise)

Respond with JSON only:
{
  "limit": 20,
  "market": "condition_id or null",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getTradeHistoryAction: Action = {
  name: "POLYMARKET_GET_TRADE_HISTORY",
  similes: [
    "POLYMARKET_MY_TRADES",
    "POLYMARKET_TRADE_LOG",
    "POLYMARKET_RECENT_TRADES",
    "POLYMARKET_SHOW_TRADES",
    "POLYMARKET_TRADING_HISTORY",
  ],
  description:
    "Fetches recent trade history from the Polymarket Data API. Can filter by market. Use when user asks about their trades, trade history, or recent fills.",

  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");
    if (!privateKey) {
      runtime.logger.warn("[getTradeHistoryAction] No private key configured");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getTradeHistoryAction] Handler called");

    let llmResult: LLMTradeHistoryResult = {};
    try {
      const result = await callLLMWithTimeout<LLMTradeHistoryResult>(
        runtime,
        state,
        getTradeHistoryTemplate,
        "getTradeHistoryAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getTradeHistoryAction] LLM extraction failed, using defaults");
    }

    const limit = Math.min(llmResult.limit ?? 20, 100);

    try {
      const walletAddress = getWalletAddress(runtime);
      const trades = await fetchUserTrades(runtime, walletAddress, {
        limit,
        market: llmResult.market ?? undefined,
      });

      let responseText = `\u{1F4DC} **Trade History** (${walletAddress.substring(0, 8)}...)\n\n`;

      if (trades.length === 0) {
        responseText += "No trades found.";
      } else {
        responseText += `Showing ${trades.length} most recent trade(s):\n\n`;
        for (const trade of trades) {
          const date = new Date(trade.timestamp * 1000).toISOString().split("T")[0];
          responseText += `  \u2022 **${trade.title}** (${trade.outcome})\n`;
          responseText += `    ${trade.side} ${trade.size} @ $${trade.price.toFixed(4)} \u2014 ${date}\n`;
          if (trade.transactionHash) {
            responseText += `    Tx: ${trade.transactionHash.substring(0, 16)}...\n`;
          }
          responseText += "\n";
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_TRADE_HISTORY"] });

      // Record activity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service && trades.length > 0) {
        const activityData: TradeHistoryActivityData = {
          type: "trade_history",
          totalTrades: trades.length,
          recentTrades: trades.slice(0, 5).map((t) => ({
            tradeId: t.transactionHash ?? "",
            side: t.side,
            price: String(t.price),
            size: String(t.size),
            market: t.conditionId,
          })),
          filterMarket: llmResult.market ?? undefined,
        };
        await service.recordActivity(activityData);
      }

      return {
        success: true,
        text: responseText,
        data: { tradeCount: trades.length, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getTradeHistoryAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `\u274C **Error fetching trade history**: ${errorMsg}`,
          actions: ["GET_TRADE_HISTORY"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me my recent Polymarket trades" } },
      {
        name: "{{user2}}",
        content: { text: "Fetching your trade history.", action: "POLYMARKET_GET_TRADE_HISTORY" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "What trades have I made on the Bitcoin market?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me pull your trades filtered by that market.", action: "POLYMARKET_GET_TRADE_HISTORY" },
      },
    ],
  ],
};
