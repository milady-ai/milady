import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { AssetType, type ClobClient } from "@polymarket/clob-client";
import { getPrivateKey, initializeClobClientWithCreds } from "../utils/clobClient";
import { callLLMWithTimeout } from "../utils/llmHelpers";

interface LLMBalanceResult {
  tokenId?: string;
  error?: string;
}

const getBalanceTemplate = `You are an assistant extracting balance query parameters from a user message.

If the user asks about a specific conditional token balance, extract the tokenId.
If they ask about USDC/collateral balance, leave tokenId null.

Respond with JSON only:
{
  "tokenId": "token_id or null",
  "error": "error message or null"
}

Recent conversation:
{{recentMessages}}

User's current request:
{{currentMessage}}`;

export const getBalanceAction: Action = {
  name: "POLYMARKET_GET_BALANCE",
  similes: [
    "POLYMARKET_CHECK_BALANCE",
    "POLYMARKET_USDC_BALANCE",
    "POLYMARKET_TOKEN_BALANCE",
    "POLYMARKET_MY_BALANCE",
    "POLYMARKET_WALLET_BALANCE",
  ],
  description:
    "Checks USDC (collateral) balance and allowance, or conditional token balance for a specific token. Requires CLOB API credentials.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    try {
      getPrivateKey(runtime);
      return true;
    } catch {
      runtime.logger.warn("[getBalanceAction] No private key configured.");
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    runtime.logger.info("[getBalanceAction] Handler called");

    let llmResult: LLMBalanceResult = {};
    try {
      const result = await callLLMWithTimeout<LLMBalanceResult>(
        runtime,
        state,
        getBalanceTemplate,
        "getBalanceAction"
      );
      if (result) llmResult = result;
    } catch {
      runtime.logger.warn("[getBalanceAction] LLM extraction failed, checking USDC balance");
    }

    try {
      const client = (await initializeClobClientWithCreds(runtime)) as ClobClient;
      let responseText = "💵 **Polymarket Balances**:\n\n";

      // Always fetch collateral balance
      const collateral = await client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      responseText += `**USDC (Collateral)**:\n`;
      responseText += `  Balance: $${collateral.balance}\n`;
      responseText += `  Allowance: $${collateral.allowance}\n\n`;

      // If a specific token was requested, fetch its balance too
      if (llmResult.tokenId) {
        const tokenBalance = await client.getBalanceAllowance({
          asset_type: AssetType.CONDITIONAL,
          token_id: llmResult.tokenId,
        });
        responseText += `**Token ${llmResult.tokenId.substring(0, 16)}...**:\n`;
        responseText += `  Balance: ${tokenBalance.balance}\n`;
        responseText += `  Allowance: ${tokenBalance.allowance}\n`;
      }

      if (callback) await callback({ text: responseText, actions: ["GET_BALANCE"] });

      return {
        success: true,
        text: responseText,
        data: {
          collateralBalance: collateral.balance,
          collateralAllowance: collateral.allowance,
          tokenId: llmResult.tokenId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      runtime.logger.error(`[getBalanceAction] Error: ${errorMsg}`);
      if (callback) {
        await callback({
          text: `❌ **Error fetching balance**: ${errorMsg}`,
          actions: ["GET_BALANCE"],
        });
      }
      return { success: false, text: `Error: ${errorMsg}`, error: errorMsg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "What's my USDC balance on Polymarket?" } },
      {
        name: "{{user2}}",
        content: { text: "Checking your collateral balance.", action: "POLYMARKET_GET_BALANCE" },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "How many YES tokens do I have for that market?" } },
      {
        name: "{{user2}}",
        content: { text: "Let me check your conditional token balance.", action: "POLYMARKET_GET_BALANCE" },
      },
    ],
  ],
};
