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
import type { DataApiPosition, MarketsActivityData } from "../types";
import { getPrivateKey, getWalletAddress } from "../utils/clobClient";
import { fetchUserPositions, fetchUserTotalValue } from "../utils/dataApi";

export const getPositionsAction: Action = {
  name: "POLYMARKET_GET_POSITIONS",
  similes: [
    "POLYMARKET_MY_POSITIONS",
    "POLYMARKET_PORTFOLIO",
    "POLYMARKET_SHOW_POSITIONS",
    "POLYMARKET_POSITION_STATUS",
    "POLYMARKET_HOLDINGS",
  ],
  description:
    "Fetches current Polymarket positions and portfolio value on demand from the Data API. Use when the user explicitly asks about their positions, portfolio, or holdings. Does NOT require CLOB API credentials — only a wallet address.",

  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    try {
      getPrivateKey(runtime);
    } catch {
      runtime.logger.warn("[getPositionsAction] No private key configured.");
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
    runtime.logger.info("[getPositionsAction] Handler called");

    try {
      const walletAddress = getWalletAddress(runtime);

      // Fetch positions and total value in parallel
      const [positions, totalValue] = await Promise.all([
        fetchUserPositions(runtime, walletAddress),
        fetchUserTotalValue(runtime, walletAddress),
      ]);

      let responseText = `📊 **Polymarket Portfolio** (${walletAddress.substring(0, 8)}...)\n\n`;
      responseText += `💰 **Total Value**: $${totalValue.toFixed(2)}\n\n`;

      if (positions.length === 0) {
        responseText += "No open positions found.";
      } else {
        responseText += `**Open Positions** (${positions.length}):\n\n`;
        for (const pos of positions) {
          const pnlSign = pos.cashPnl >= 0 ? "+" : "";
          const pctSign = pos.percentPnl >= 0 ? "+" : "";
          responseText += `  • **${pos.title}** (${pos.outcome})\n`;
          responseText += `    Size: ${pos.size} @ avg $${pos.avgPrice.toFixed(4)} | Current: $${pos.curPrice.toFixed(4)}\n`;
          responseText += `    P&L: ${pnlSign}$${pos.cashPnl.toFixed(2)} (${pctSign}${pos.percentPnl.toFixed(1)}%)\n\n`;
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_POSITIONS"] });

      // Record activity for context continuity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service && positions.length > 0) {
        const activityData: MarketsActivityData = {
          type: "markets_list",
          mode: "standard",
          count: positions.length,
          markets: positions.slice(0, 5).map((p) => ({
            conditionId: p.conditionId,
            question: p.title,
            active: true,
            closed: false,
          })),
        };
        await service.recordActivity(activityData);
      }

      return {
        success: true,
        text: responseText,
        data: {
          positionCount: positions.length,
          totalValue,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getPositionsAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching positions**: ${errorMsg}`,
          actions: ["GET_POSITIONS"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Show me my current Polymarket positions" } },
      {
        name: "{{user2}}",
        content: { text: "Fetching your portfolio from the Data API.", action: "POLYMARKET_GET_POSITIONS" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "What's my portfolio value?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me check your current positions and total value.", action: "POLYMARKET_GET_POSITIONS" },
      },
    ],
  ],
};
