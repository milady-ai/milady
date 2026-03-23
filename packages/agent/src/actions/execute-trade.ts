/**
 * EXECUTE_TRADE action - executes a BSC token trade (buy or sell).
 */

import type { Action, HandlerOptions, IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import {
  buildAuthHeaders,
  WALLET_ACTION_API_PORT,
  walletActionFetch,
} from "./wallet-action-shared";

const TRADE_TIMEOUT_MS = 60_000;
const BSC_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function isValidParam(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const v = val.trim().toLowerCase();
  return (
    v.length > 0 &&
    v !== "unknown" &&
    !v.includes("required") &&
    v !== "undefined" &&
    v !== "null"
  );
}

export const executeTradeAction: Action = {
  name: "EXECUTE_TRADE",
  similes: ["BUY_TOKEN", "SELL_TOKEN", "SWAP", "TRADE", "BUY", "SELL"],
  description:
    "Execute a BSC token trade (buy or sell). Use this when a user asks to buy or sell a token on BSC/BNB Chain.",
  validate: async (runtime: IAgentRuntime) => {
    const hasWallet =
      runtime.getSetting("EVM_PRIVATE_KEY") ||
      runtime.getSetting("PRIVY_APP_ID");
    return Boolean(hasWallet);
  },
  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      logger.debug(
        "[EXECUTE_TRADE] handler called with params:",
        JSON.stringify(params ?? {}),
      );

      const rawSide = isValidParam(params?.side as string)
        ? (params?.side as string)
        : undefined;
      const side =
        typeof rawSide === "string" ? rawSide.trim().toLowerCase() : undefined;
      if (side !== "buy" && side !== "sell") {
        return {
          text: 'I need a valid trade side ("buy" or "sell").',
          success: false,
        };
      }

      const rawAddr = isValidParam(params?.tokenAddress as string)
        ? (params?.tokenAddress as string)
        : undefined;
      const tokenAddress =
        typeof rawAddr === "string" ? rawAddr.trim() : undefined;
      if (!tokenAddress || !BSC_ADDRESS_RE.test(tokenAddress)) {
        return {
          text: "I need a valid BSC token contract address (0x-prefixed, 40 hex chars).",
          success: false,
        };
      }

      const rawAmt = isValidParam(params?.amount as string)
        ? (params?.amount as string)
        : typeof params?.amount === "number" && params.amount > 0
          ? String(params.amount)
          : undefined;
      const amountRaw = typeof rawAmt === "string" ? rawAmt.trim() : undefined;
      if (
        !amountRaw ||
        Number.isNaN(Number(amountRaw)) ||
        Number(amountRaw) <= 0
      ) {
        return {
          text: "I need a positive numeric amount for the trade.",
          success: false,
        };
      }

      const slippageBps =
        typeof params?.slippageBps === "number"
          ? params.slippageBps
          : typeof params?.slippageBps === "string" &&
              params.slippageBps.trim() !== ""
            ? Number(params.slippageBps)
            : 300;
      if (Number.isNaN(slippageBps) || slippageBps < 0) {
        return {
          text: "slippageBps must be a non-negative number.",
          success: false,
        };
      }

      const response = await walletActionFetch(
        `http://127.0.0.1:${WALLET_ACTION_API_PORT}/api/wallet/trade/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Eliza-Agent-Action": "1",
            ...buildAuthHeaders(),
          },
          body: JSON.stringify({
            side,
            tokenAddress,
            amount: amountRaw,
            slippageBps,
            confirm: true,
          }),
          signal: AbortSignal.timeout(TRADE_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<
          string,
          string
        >;
        return {
          text: `Trade failed: ${body.error ?? `HTTP ${response.status}`}`,
          success: false,
        };
      }

      const result = (await response.json()) as {
        ok: boolean;
        mode: string;
        executed: boolean;
        requiresUserSignature: boolean;
        unsignedTx?: Record<string, unknown>;
        execution?: {
          hash: string;
          explorerUrl: string;
          status: string;
        };
        error?: string;
      };

      if (!result.ok) {
        return {
          text: `Trade failed: ${result.error ?? "unknown error"}`,
          success: false,
        };
      }

      if (result.executed && result.execution) {
        return {
          text:
            `Trade executed successfully! ${side.toUpperCase()} via ${result.mode} mode.\n` +
            `TX: ${result.execution.explorerUrl}\n` +
            `Status: ${result.execution.status}`,
          success: true,
          data: {
            side,
            tokenAddress,
            amount: amountRaw,
            mode: result.mode,
            txHash: result.execution.hash,
            explorerUrl: result.execution.explorerUrl,
            executed: true,
          },
        };
      }

      return {
        text:
          `Trade prepared in ${result.mode} mode. ` +
          `A user signature is required to complete the ${side}.`,
        success: true,
        data: {
          side,
          tokenAddress,
          amount: amountRaw,
          mode: result.mode,
          requiresUserSignature: true,
          executed: false,
          unsignedTx: result.unsignedTx,
        },
      };
    } catch (err) {
      return {
        text: `Trade failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },
  parameters: [
    {
      name: "side",
      description: 'Trade direction: "buy" or "sell"',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "tokenAddress",
      description: "BSC token contract address (0x-prefixed, 40 hex characters)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: "Human-readable trade amount.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "slippageBps",
      description: "Slippage tolerance in basis points (default 300 = 3%).",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
