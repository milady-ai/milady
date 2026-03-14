/**
 * @elizaos/plugin-polymarket Trade Risk Evaluator
 *
 * Post-action evaluator that assesses risk after order placement.
 * Advisory only — warns but does not block.
 * Writes risk assessment to memory for context in subsequent responses.
 */

import {
  type ActionResult,
  type Evaluator,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
} from "@elizaos/core";
import { POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import { initializeClobClient } from "../utils/clobClient";
import { deriveBestBid, deriveBestAsk } from "../utils/orderBook";
import type { OrderBook } from "../types";

function getConfigNumber(runtime: IAgentRuntime, key: string, defaultValue: number): number {
  const val = runtime.getSetting(key);
  if (!val) return defaultValue;
  const parsed = parseFloat(String(val));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export const tradeRiskEvaluator: Evaluator = {
  name: "POLYMARKET_TRADE_RISK",
  description: "Evaluates trade risk after Polymarket order placement. Checks position concentration, spread width, and trade size.",
  similes: ["TRADE_RISK_CHECK", "ORDER_RISK_ASSESSMENT"],
  alwaysRun: false,
  phase: "post",

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const content = message.content as Record<string, unknown>;
    const actions = content?.actions as string[] | undefined;
    if (!actions) return false;
    return actions.some(
      (a) => a === "POLYMARKET_PLACE_ORDER" || a === "POLYMARKET_CLOSE_POSITION"
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: HandlerOptions,
    _callback?: HandlerCallback
  ): Promise<ActionResult | undefined> => {
    logger.info("[tradeRiskEvaluator] Running post-trade risk assessment");

    const warnings: string[] = [];
    const content = message.content as Record<string, unknown>;
    const tradeData = content?.data as Record<string, unknown> | undefined;

    if (!tradeData) {
      logger.warn("[tradeRiskEvaluator] No trade data in message");
      return;
    }

    const maxPositionPct = getConfigNumber(runtime, "POLYMARKET_MAX_POSITION_PCT", 25);
    const maxSpreadPct = getConfigNumber(runtime, "POLYMARKET_MAX_SPREAD_PCT", 10);
    const maxTradeSizeUsd = getConfigNumber(runtime, "POLYMARKET_MAX_TRADE_SIZE_USD", 100);

    // Check 1: Trade size
    const tradePrice = parseFloat(String(tradeData.price ?? tradeData.sellPrice ?? "0"));
    const tradeSize = parseFloat(String(tradeData.size ?? tradeData.positionSize ?? "0"));
    const tradeDollarValue = tradePrice * tradeSize;

    if (tradeDollarValue > maxTradeSizeUsd) {
      warnings.push(
        `Trade size ($${tradeDollarValue.toFixed(2)}) exceeds threshold ($${maxTradeSizeUsd})`
      );
    }

    // Check 2: Spread width
    const tokenId = (tradeData.tokenId ?? tradeData.tokenID) as string | undefined;
    if (tokenId) {
      try {
        const client = await initializeClobClient(runtime);
        const ob = (await client.getOrderBook(tokenId)) as OrderBook;
        const bestBid = deriveBestBid(ob.bids ?? []);
        const bestAsk = deriveBestAsk(ob.asks ?? []);

        if (bestBid && bestAsk) {
          const midpoint = (bestBid.price + bestAsk.price) / 2;
          const spreadPct = midpoint > 0 ? ((bestAsk.price - bestBid.price) / midpoint) * 100 : 0;
          if (spreadPct > maxSpreadPct) {
            warnings.push(
              `Wide spread: ${spreadPct.toFixed(1)}% (bid $${bestBid.price.toFixed(4)}, ask $${bestAsk.price.toFixed(4)}). Market may be illiquid.`
            );
          }
        }
      } catch {
        // Can't fetch orderbook — skip spread check
      }
    }

    // Check 3: Position concentration
    const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
    if (service && tokenId) {
      const accountState = service.getCachedAccountState();
      if (accountState) {
        const position = accountState.positions.find((p) => p.asset_id === tokenId);
        if (position) {
          const collateralBalance = parseFloat(
            accountState.balances.collateral?.balance ?? "0"
          );
          const positionValue = parseFloat(position.size) * parseFloat(position.average_price);

          let totalValue = collateralBalance;
          for (const p of accountState.positions) {
            totalValue += parseFloat(p.size) * parseFloat(p.average_price);
          }

          if (totalValue > 0) {
            const concentrationPct = (positionValue / totalValue) * 100;
            if (concentrationPct > maxPositionPct) {
              warnings.push(
                `Position concentration: ${concentrationPct.toFixed(0)}% of portfolio in this market (threshold: ${maxPositionPct}%)`
              );
            }
          }
        }
      }
    }

    // Write risk assessment to memory
    if (warnings.length > 0) {
      const riskLevel = warnings.length >= 3 ? "high" : warnings.length >= 2 ? "medium" : "low";
      const riskText =
        `Trade Risk Assessment (${riskLevel}):\n` +
        warnings.map((w) => `  - ${w}`).join("\n");

      logger.warn(`[tradeRiskEvaluator] ${riskText}`);

      const riskMemory: Memory = {
        id: crypto.randomUUID() as `${string}-${string}-${string}-${string}-${string}`,
        entityId: message.entityId,
        agentId: message.agentId,
        roomId: message.roomId,
        createdAt: Date.now(),
        content: {
          text: riskText,
          data: {
            type: "trade_risk_assessment",
            riskLevel,
            warnings,
            tokenId,
            tradeDollarValue,
            timestamp: Date.now(),
          },
        },
      };

      await runtime.createMemory(riskMemory, "polymarket_risk_assessments");
    } else {
      logger.info("[tradeRiskEvaluator] No risk warnings for this trade");
    }

    return undefined;
  },

  examples: [
    {
      prompt: "User placed a large order and the risk evaluator should assess it.",
      messages: [
        { name: "{{user1}}", content: { text: "Buy 500 shares of YES at $0.85" } },
        {
          name: "{{user2}}",
          content: {
            text: "Order placed. Risk evaluator checks position concentration, spread, and trade size.",
            action: "POLYMARKET_PLACE_ORDER",
          },
        },
      ],
      outcome: "Risk assessment written to memory with warnings about trade size and concentration.",
    },
  ],
};
