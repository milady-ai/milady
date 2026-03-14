import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import type { ClobClient } from "@polymarket/clob-client";
import { DEFAULT_CLOB_API_URL, POLYMARKET_SERVICE_NAME } from "../constants";
import type { PolymarketService } from "../services/polymarket";
import type { RewardsActivityData } from "../types";
import { initializeClobClientWithCreds } from "../utils/clobClient";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMRewardsResult {
  date?: string;
  marketId?: string;
  mode?: "daily" | "total" | "current_markets" | "market_rewards";
  error?: string;
}

const getRewardsTemplate = `You are an assistant extracting reward/earnings query parameters from a user message.

Determine what the user wants:
- "daily" — earnings for a specific day (default: today)
- "total" — total earnings for a day
- "current_markets" — which markets currently offer rewards
- "market_rewards" — raw rewards for a specific market (needs marketId/conditionId)

Respond with JSON only:
{
  "date": "YYYY-MM-DD or null",
  "marketId": "condition_id or null",
  "mode": "daily|total|current_markets|market_rewards",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getRewardsAction: Action = {
  name: "POLYMARKET_GET_REWARDS",
  similes: [
    "POLYMARKET_LP_EARNINGS",
    "POLYMARKET_REWARD_STATUS",
    "POLYMARKET_LIQUIDITY_REWARDS",
    "POLYMARKET_CHECK_EARNINGS",
    "POLYMARKET_MY_REWARDS",
    "POLYMARKET_REWARD_MARKETS",
  ],
  description:
    "Retrieves LP rewards and earnings data from Polymarket. Can show daily earnings, total earnings, current reward markets, or raw rewards for a specific market. Requires CLOB API credentials.",

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const clobApiUrl = runtime.getSetting("CLOB_API_URL") || DEFAULT_CLOB_API_URL;
    const privateKey =
      runtime.getSetting("WALLET_PRIVATE_KEY") ||
      runtime.getSetting("PRIVATE_KEY") ||
      runtime.getSetting("POLYMARKET_PRIVATE_KEY");

    if (!clobApiUrl || !privateKey) {
      runtime.logger.warn("[getRewardsAction] Missing CLOB_API_URL or private key");
      return false;
    }

    const clobApiKey = runtime.getSetting("CLOB_API_KEY");
    const clobApiSecret = runtime.getSetting("CLOB_API_SECRET") || runtime.getSetting("CLOB_SECRET");
    const clobApiPassphrase =
      runtime.getSetting("CLOB_API_PASSPHRASE") || runtime.getSetting("CLOB_PASS_PHRASE");

    if (!clobApiKey || !clobApiSecret || !clobApiPassphrase) {
      runtime.logger.warn("[getRewardsAction] Missing CLOB API credentials for L2 auth");
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
    runtime.logger.info("[getRewardsAction] Handler called");

    let llmResult: LLMRewardsResult = { mode: "daily" };
    try {
      const result = await callLLMWithTimeout<LLMRewardsResult>(
        runtime,
        state,
        getRewardsTemplate,
        "getRewardsAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getRewardsAction] LLM extraction failed, defaulting to daily mode");
    }

    const mode = llmResult.mode || "daily";
    const date = llmResult.date || new Date().toISOString().split("T")[0];

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let responseText = "";

      switch (mode) {
        case "daily": {
          const earnings = await client.getEarningsForUserForDay(date);
          responseText = `📊 **LP Earnings for ${date}**:\n\n`;
          if (earnings && typeof earnings === "object") {
            responseText += `\`\`\`json\n${JSON.stringify(earnings, null, 2)}\n\`\`\``;
          } else {
            responseText += "No earnings data found for this date.";
          }
          break;
        }

        case "total": {
          const total = await client.getTotalEarningsForUserForDay(date);
          responseText = `💰 **Total Earnings for ${date}**: ${JSON.stringify(total)}`;
          break;
        }

        case "current_markets": {
          const currentRewards = await client.getCurrentRewards();
          responseText = `🎯 **Current Reward Markets**:\n\n`;
          if (Array.isArray(currentRewards) && currentRewards.length > 0) {
            for (const market of currentRewards.slice(0, 20)) {
              const m = market as unknown as Record<string, unknown>;
              responseText += `  • ${m.condition_id ?? "unknown"}\n`;
            }
            if (currentRewards.length > 20) {
              responseText += `  ... and ${currentRewards.length - 20} more\n`;
            }
          } else {
            responseText += "No reward markets found.";
          }
          break;
        }

        case "market_rewards": {
          if (!llmResult.marketId) {
            const errorMsg = "Please specify a market condition ID to check rewards.";
            if (callback) await callback({ text: `❌ ${errorMsg}`, actions: ["GET_REWARDS"] });
            return { success: false, text: errorMsg, error: errorMsg };
          }
          const marketRewards = await client.getRawRewardsForMarket(llmResult.marketId);
          responseText = `📈 **Rewards for Market ${llmResult.marketId.substring(0, 16)}...**:\n\n`;
          responseText += `\`\`\`json\n${JSON.stringify(marketRewards, null, 2)}\n\`\`\``;
          break;
        }
      }

      if (callback) await callback({ text: responseText, actions: ["GET_REWARDS"] });

      // Record activity
      const service = runtime.getService(POLYMARKET_SERVICE_NAME) as PolymarketService | undefined;
      if (service) {
        const activityData: RewardsActivityData = {
          type: "rewards_earnings",
          date,
          totalEarnings: "fetched",
          marketCount: 0,
        };
        await service.recordActivity(activityData);
      }

      return { success: true, text: responseText };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getRewardsAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching rewards**: ${errorMsg}`,
          actions: ["GET_REWARDS"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "How much did I earn in LP rewards today?" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Let me check your daily LP earnings.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Which markets are currently offering liquidity rewards?" },
      },
      {
        name: "{{user2}}",
        content: {
          text: "I'll fetch the current reward markets for you.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Show me reward rates for market 0x5f651..." },
      },
      {
        name: "{{user2}}",
        content: {
          text: "Checking reward data for that market.",
          action: "POLYMARKET_GET_REWARDS",
        },
      },
    ],
  ],
};
