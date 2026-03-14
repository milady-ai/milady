/**
 * @elizaos/plugin-polymarket Cancel Order Action
 *
 * Cancels one or more open orders using the appropriate CLOB client method:
 * - cancelAll() for all orders
 * - cancelMarketOrders({ asset_id }) for per-token cancellation
 * - cancelOrder({ orderID }) for specific orders
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
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import {
  callLLMWithTimeout,
  isLLMError,
  sendAcknowledgement,
  sendError,
} from "../utils/llmHelpers";

// =============================================================================
// Types
// =============================================================================

interface LLMCancelOrderResult {
  orderIds?: string[];
  cancelAll?: boolean;
  tokenId?: string;
  error?: string;
}

// =============================================================================
// Template
// =============================================================================

const cancelOrderTemplate = `You are an assistant extracting cancel order parameters from user messages for Polymarket.

The user wants to cancel orders. Extract:
- "orderIds": array of specific order ID strings (if the user mentions specific orders)
- "cancelAll": true if the user wants to cancel ALL their orders
- "tokenId": a token ID or asset ID if the user wants to cancel all orders on a specific market/token

At least one of orderIds, cancelAll, or tokenId must be provided.

Respond with JSON only:
{
  "orderIds": ["string"] | null,
  "cancelAll": true | false,
  "tokenId": "string" | null
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

// =============================================================================
// Action Definition
// =============================================================================

export const cancelOrderAction: Action = {
  name: "POLYMARKET_CANCEL_ORDER",
  similes: [
    "CANCEL_ORDER",
    "CANCEL_ORDERS",
    "REMOVE_ORDER",
    "DELETE_ORDER",
    "CANCEL_ALL_ORDERS",
    "CANCEL_MY_ORDERS",
  ],
  description:
    "Cancels one or more open Polymarket orders. Can cancel specific orders by ID, all orders on a token/market, or all orders globally. Requires L1+L2 authentication.",

  parameters: [
    {
      name: "orderIds",
      description: "Specific order IDs to cancel",
      required: false,
      schema: { type: "array", items: { type: "string" } },
    },
    {
      name: "cancelAll",
      description: "If true, cancel all open orders",
      required: false,
      schema: { type: "boolean" },
    },
    {
      name: "tokenId",
      description: "Cancel all orders for a specific token/asset ID",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const hasPrivateKey = Boolean(
      runtime.getSetting("POLYMARKET_PRIVATE_KEY") ||
        runtime.getSetting("EVM_PRIVATE_KEY") ||
        runtime.getSetting("WALLET_PRIVATE_KEY")
    );
    if (!hasPrivateKey) {
      runtime.logger.warn("[cancelOrderAction] No private key configured.");
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
    runtime.logger.info("[cancelOrderAction] Handler called");

    // Extract parameters
    let orderIds: string[] | null = null;
    let cancelAll = false;
    let tokenId: string | null = null;

    const params = options?.parameters as Record<string, unknown> | undefined;
    if (params?.orderIds) {
      orderIds = params.orderIds as string[];
    } else if (params?.cancelAll) {
      cancelAll = true;
    } else if (params?.tokenId) {
      tokenId = params.tokenId as string;
    } else {
      // LLM extraction
      const llmResult = await callLLMWithTimeout<LLMCancelOrderResult>(
        runtime,
        state,
        cancelOrderTemplate,
        "cancelOrderAction"
      );

      if (!isLLMError(llmResult) && llmResult) {
        orderIds = llmResult.orderIds ?? null;
        cancelAll = llmResult.cancelAll ?? false;
        tokenId = llmResult.tokenId ?? null;
      }
    }

    if (!orderIds?.length && !cancelAll && !tokenId) {
      await sendError(
        callback,
        "Please specify which orders to cancel: specific order IDs, a token/market, or 'cancel all'."
      );
      return { success: false, text: "Missing cancel parameters", error: "missing_params" };
    }

    const mode = cancelAll
      ? "all orders"
      : tokenId
        ? `orders on token ${tokenId.slice(0, 16)}...`
        : `${orderIds!.length} specific order(s)`;

    await sendAcknowledgement(callback, `Cancelling ${mode}...`);

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let cancelledCount = 0;
      const errors: string[] = [];

      if (cancelAll) {
        await client.cancelAll();
        const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
        const accountState = service?.getCachedAccountState();
        cancelledCount = accountState?.activeOrders.length ?? 0;
        runtime.logger.info("[cancelOrderAction] cancelAll() executed");
      } else if (tokenId) {
        await client.cancelMarketOrders({ asset_id: tokenId });
        const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
        const accountState = service?.getCachedAccountState();
        cancelledCount =
          accountState?.activeOrders.filter((o) => o.asset_id === tokenId).length ?? 0;
        runtime.logger.info(`[cancelOrderAction] cancelMarketOrders for ${tokenId.slice(0, 16)}`);
      } else if (orderIds) {
        for (const orderId of orderIds) {
          try {
            await client.cancelOrder({ orderID: orderId });
            cancelledCount++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Order ${orderId}: ${msg}`);
            runtime.logger.warn(`[cancelOrderAction] Failed to cancel ${orderId}: ${msg}`);
          }
        }
      }

      // Invalidate account state cache
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service) {
        service.invalidateAccountState();
      }

      // Build response
      let responseText: string;
      if (errors.length > 0 && cancelledCount > 0) {
        responseText =
          `Cancelled ${cancelledCount} order(s). ` +
          `${errors.length} failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      } else if (errors.length > 0) {
        responseText = `Failed to cancel orders:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      } else if (cancelledCount === 0) {
        responseText = "No open orders to cancel.";
      } else {
        responseText = `Successfully cancelled ${cancelledCount} order(s).`;
      }

      const content: Content = {
        text: responseText,
        actions: ["POLYMARKET_CANCEL_ORDER"],
        data: { cancelledCount, errors, mode },
      };

      if (callback) await callback(content);

      return {
        success: errors.length === 0,
        text: responseText,
        data: content.data,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error("[cancelOrderAction] Error:", error);
      await sendError(callback, errorMsg);
      return { success: false, text: errorMsg, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Cancel all my orders" } },
      { name: "{{user2}}", content: { text: "I'll cancel all your open orders.", action: "POLYMARKET_CANCEL_ORDER" } },
    ],
    [
      { name: "{{user1}}", content: { text: "Cancel my orders on token 0x123abc" } },
      { name: "{{user2}}", content: { text: "I'll cancel all orders on that token.", action: "POLYMARKET_CANCEL_ORDER" } },
    ],
    [
      { name: "{{user1}}", content: { text: "Remove order abc-123-def" } },
      { name: "{{user2}}", content: { text: "I'll cancel that specific order.", action: "POLYMARKET_CANCEL_ORDER" } },
    ],
  ],
};
