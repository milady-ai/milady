/**
 * @elizaos/plugin-polymarket Close Position Action
 *
 * Exits a position by selling all held shares. Detects YES/NO side automatically.
 * Defaults to market order (FOK) with fallback to limit at best bid.
 * Optionally cancels open orders on the token first.
 */

import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import type { ClobClient } from "@polymarket/clob-client";
import { Side } from "@polymarket/clob-client";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { OrderBook, Position } from "../types";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import { deriveBestBid } from "../utils/orderBook";
import {
  callLLMWithTimeout,
  isLLMError,
  sendAcknowledgement,
  sendError,
  sendUpdate,
} from "../utils/llmHelpers";

// =============================================================================
// Types
// =============================================================================

interface LLMClosePositionResult {
  tokenId?: string;
  marketName?: string;
  cancelOpenOrders?: boolean;
  orderType?: "limit" | "market";
  error?: string;
}

// =============================================================================
// Template
// =============================================================================

const closePositionTemplate = `You are an assistant extracting close position parameters from user messages for Polymarket.

The user wants to close/exit a position. Extract:
- "tokenId": the token ID or asset ID to close position on (hex string)
- "marketName": natural language market name if no token ID provided
- "cancelOpenOrders": whether to also cancel open orders on this token (default true)
- "orderType": "market" for immediate exit (default) or "limit" for best-bid limit order

Respond with JSON only:
{
  "tokenId": "string or null",
  "marketName": "string or null",
  "cancelOpenOrders": true,
  "orderType": "market"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

// =============================================================================
// Action Definition
// =============================================================================

export const closePositionAction: Action = {
  name: "POLYMARKET_CLOSE_POSITION",
  similes: [
    "CLOSE_POSITION",
    "EXIT_POSITION",
    "SELL_ALL",
    "SELL_POSITION",
    "CLOSE_TRADE",
    "EXIT_TRADE",
  ],
  description:
    "Closes/exits a Polymarket position by selling all held shares on a token. Detects YES/NO side automatically. " +
    "Defaults to market order (FOK) for immediate exit, with fallback to limit at best bid. " +
    "Optionally cancels open orders on the token first. Requires L1+L2 authentication.",

  parameters: [
    { name: "tokenId", description: "Token ID to close position on", required: false, schema: { type: "string" } },
    { name: "marketName", description: "Market name for lookup (alternative to tokenId)", required: false, schema: { type: "string" } },
    { name: "cancelOpenOrders", description: "Cancel open orders on this token first (default: true)", required: false, schema: { type: "boolean" } },
    { name: "orderType", description: "Order type: 'market' (FOK, default) or 'limit' (best bid GTC)", required: false, schema: { type: "string", enum: ["market", "limit"] } },
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const hasPrivateKey = Boolean(
      runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
        runtime.getSetting("EVM_PRIVATE_KEY") ||
        runtime.getSetting("WALLET_PRIVATE_KEY")
    );
    if (!hasPrivateKey) {
      runtime.logger.warn("[closePositionAction] No private key configured.");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[closePositionAction] Handler called");

    // Extract parameters
    let tokenId: string | null = null;
    let marketName: string | null = null;
    let cancelOpenOrders = true;
    let orderType: "market" | "limit" = "market";

    const params = options?.parameters as Record<string, unknown> | undefined;
    if (params?.tokenId) {
      tokenId = params.tokenId as string;
    } else if (params?.marketName) {
      marketName = params.marketName as string;
    }
    if (params?.cancelOpenOrders !== undefined) {
      cancelOpenOrders = Boolean(params.cancelOpenOrders);
    }
    if (params?.orderType === "limit") {
      orderType = "limit";
    }

    if (!tokenId && !marketName) {
      // LLM extraction
      const llmResult = await callLLMWithTimeout<LLMClosePositionResult>(
        runtime,
        state,
        closePositionTemplate,
        "closePositionAction"
      );

      if (!isLLMError(llmResult) && llmResult) {
        tokenId = llmResult.tokenId ?? null;
        marketName = llmResult.marketName ?? null;
        if (llmResult.cancelOpenOrders !== undefined) {
          cancelOpenOrders = llmResult.cancelOpenOrders;
        }
        if (llmResult.orderType === "limit") {
          orderType = "limit";
        }
      }
    }

    if (!tokenId && !marketName) {
      await sendError(callback, "Please specify which position to close (token ID or market name).");
      return { success: false, text: "Missing position identifier", error: "missing_id" };
    }

    await sendAcknowledgement(callback, "Looking up your position...", {
      tokenId: tokenId?.slice(0, 16),
      marketName: marketName ?? undefined,
    });

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;

      // Find the user's position
      const accountState = service ? await service.getAccountState() : null;
      if (!accountState) {
        throw new Error("Unable to fetch account state. Please check your credentials.");
      }

      let position: Position | undefined;

      if (tokenId) {
        position = accountState.positions.find((p) => p.asset_id === tokenId);
      } else if (marketName) {
        await sendError(
          callback,
          "Please provide the token ID for the position you want to close. " +
            "You can find it by asking me to show your positions."
        );
        return { success: false, text: "Token ID required for close position", error: "need_token_id" };
      }

      if (!position || parseFloat(position.size) === 0) {
        const msg = tokenId
          ? `No open position found for token ${tokenId.slice(0, 16)}...`
          : "No matching position found.";
        if (callback) await callback({ text: msg });
        return { success: true, text: msg };
      }

      tokenId = position.asset_id;
      const positionSize = parseFloat(position.size);

      await sendUpdate(
        callback,
        `Found position: ${positionSize} shares @ avg $${position.average_price}. ` +
          `${cancelOpenOrders ? "Cancelling open orders first..." : "Placing sell order..."}`
      );

      // Step 1: Cancel open orders on this token if requested
      if (cancelOpenOrders) {
        try {
          await client.cancelMarketOrders({ asset_id: tokenId });
          runtime.logger.info(`[closePositionAction] Cancelled orders for ${tokenId.slice(0, 16)}`);
        } catch (err) {
          runtime.logger.warn("[closePositionAction] Failed to cancel orders:", err);
        }
      }

      // Step 2: Fetch orderbook and place sell order
      let orderBook: OrderBook;
      try {
        orderBook = (await client.getOrderBook(tokenId)) as OrderBook;
      } catch (err) {
        throw new Error("Failed to fetch order book. Cannot determine sell price.");
      }

      const bestBidResult = deriveBestBid(orderBook.bids ?? []);
      if (!bestBidResult) {
        throw new Error(
          "No bids in the order book — zero liquidity. Cannot close position. " +
            "You may need to wait for buyers or try a lower price manually."
        );
      }

      let responseText: string;
      let orderResult: unknown;

      if (orderType === "market") {
        // Try FOK market order for immediate fill
        try {
          orderResult = await client.createAndPostMarketOrder({
            tokenID: tokenId,
            side: Side.SELL,
            amount: positionSize,
          });

          responseText =
            `Position closed via market order.\n` +
            `  Sold: ${positionSize} shares\n` +
            `  Entry: $${position.average_price}\n` +
            `  Order ID: ${(orderResult as { orderID?: string })?.orderID ?? "submitted"}`;
        } catch (err) {
          // FOK failed — fallback to limit at best bid
          runtime.logger.warn("[closePositionAction] Market order failed, falling back to limit:", err);

          orderResult = await client.createAndPostOrder({
            tokenID: tokenId,
            side: Side.SELL,
            price: bestBidResult.price,
            size: positionSize,
            feeRateBps: 0,
          });

          responseText =
            `Market order failed (insufficient liquidity). Placed limit sell instead.\n` +
            `  Selling: ${positionSize} shares @ $${bestBidResult.price.toFixed(4)}\n` +
            `  Entry: $${position.average_price}\n` +
            `  Est. proceeds: $${(positionSize * bestBidResult.price).toFixed(2)}\n` +
            `  Note: This is a limit order — it may not fill immediately.`;
        }
      } else {
        // Limit order at best bid
        orderResult = await client.createAndPostOrder({
          tokenID: tokenId,
          side: Side.SELL,
          price: bestBidResult.price,
          size: positionSize,
          feeRateBps: 0,
        });

        responseText =
          `Limit sell order placed to close position.\n` +
          `  Selling: ${positionSize} shares @ $${bestBidResult.price.toFixed(4)}\n` +
          `  Entry: $${position.average_price}\n` +
          `  Est. proceeds: $${(positionSize * bestBidResult.price).toFixed(2)}\n` +
          `  Note: This is a limit order — it may not fill immediately.`;
      }

      // Invalidate account state cache
      if (service) {
        service.invalidateAccountState();
      }

      const orderResultSafe = orderResult
        ? (JSON.parse(JSON.stringify(orderResult)) as Record<string, unknown>)
        : null;

      const contentData: Record<string, unknown> = {
        tokenId,
        positionSize,
        avgEntry: position.average_price,
        sellPrice: bestBidResult.price,
        orderType,
      };
      if (orderResultSafe) {
        contentData.orderResult = orderResultSafe;
      }

      const content: Content = {
        text: responseText,
        actions: ["POLYMARKET_CLOSE_POSITION"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: contentData as any,
      };

      if (callback) await callback(content);
      return { success: true, text: responseText, data: content.data };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error("[closePositionAction] Error:", error);
      await sendError(callback, errorMsg);
      return { success: false, text: errorMsg, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Close my position on token 0x123abc" } },
      { name: "{{user2}}", content: { text: "I'll close your position on that token.", action: "POLYMARKET_CLOSE_POSITION" } },
    ],
    [
      { name: "{{user1}}", content: { text: "Exit all my positions" } },
      { name: "{{user2}}", content: { text: "I'll need to close each position individually. Let me check your positions first." } },
    ],
    [
      { name: "{{user1}}", content: { text: "Sell everything on the Bitcoin market" } },
      { name: "{{user2}}", content: { text: "I'll close your position on that market.", action: "POLYMARKET_CLOSE_POSITION" } },
    ],
  ],
};
