/**
 * EXECUTE_TRADE action — executes a BSC token trade (buy or sell).
 *
 * When triggered the action:
 *   1. Validates parameters (side, tokenAddress format, amount > 0)
 *   2. POSTs to the local trade execution API with agent automation header
 *   3. Returns structured result: quote details, execution status, txHash
 *      if executed, or unsigned TX info if user-sign mode
 *
 * All business logic (permissions, safety caps, signing) is handled
 * server-side — this action is a thin wrapper.
 *
 * @module actions/execute-trade
 */

import type { Action, ActionExample, HandlerOptions, HandlerCallback, IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import {
  buildAuthHeaders,
  WALLET_ACTION_API_PORT,
  walletActionFetch,
} from "./wallet-action-shared.js";

/** Timeout for the trade API call (includes on-chain confirmation). */
const TRADE_TIMEOUT_MS = 60_000;

/** Matches a 0x-prefixed 40-hex-char BSC address. */
const BSC_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Check if a value is a valid extracted param (not a placeholder). */
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

// --- NEW TYPES AND HELPERS ---
interface WalletTradeResponse {
  success: boolean;
  error?: string;
  txHash?: string;
  amountIn?: string;
  amountOut?: number;
  amountOutStr?: string;
  explorerUrl?: string;
  side: string;
  mode: string;
  tokenAddress: string;
  executed: boolean;
  requiresUserSignature: boolean;
  unsignedTx?: Record<string, unknown>;
  quote?: Record<string, unknown>;
  execution?: {
    hash: string;
    explorerUrl: string;
    status: string;
    blockNumber: number | null;
  };
}

function formatTradeSuccess(data: WalletTradeResponse): string {
  if (data.executed && data.execution) {
    return (
      `Trade executed successfully! ${data.side.toUpperCase()} via ${data.mode} mode.\n` +
      `TX: ${data.execution.explorerUrl}\n` +
      `Status: ${data.execution.status}`
    );
  }
  // user-sign mode — trade was quoted but not executed on-chain
  return (
    `Trade prepared in ${data.mode} mode. ` +
    `A user signature is required to complete the ${data.side}.`
  );
}
// --- END NEW TYPES AND HELPERS ---

export const executeTradeAction: Action = {
  name: "EXECUTE_TRADE",

  similes: ["BUY_TOKEN", "SELL_TOKEN", "SWAP", "TRADE", "BUY", "SELL"],

  description:
    "Execute a BSC token trade (buy or sell). Use this when a user asks to " +
    "buy or sell a token on BSC/BNB Chain. The trade is routed through " +
    "PancakeSwap and respects the current trade permission mode.",

  validate: async (runtime: IAgentRuntime) => {
    const hasWallet =
      runtime.getSetting("EVM_PRIVATE_KEY") ||
      runtime.getSetting("PRIVY_APP_ID");
    return Boolean(hasWallet);
  },

  handler: async (_runtime, _message, _state, options, callback?: HandlerCallback) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      logger.debug(
        `[EXECUTE_TRADE] handler called with params:`,
        JSON.stringify(params ?? {}),
      );

      // ── Resolve side ─────────────────────────────────────────────────
      const rawSide = isValidParam(params?.side as string)
        ? (params?.side as string)
        : undefined;
      const side =
        typeof rawSide === "string" ? rawSide.trim().toLowerCase() : undefined;

      if (side !== "buy" && side !== "sell") {
        const text = 'I need a valid trade side ("buy" or "sell").';
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      // ── Resolve tokenAddress ─────────────────────────────────────────
      const rawAddr = isValidParam(params?.tokenAddress as string)
        ? (params?.tokenAddress as string)
        : undefined;
      const tokenAddress =
        typeof rawAddr === "string" ? rawAddr.trim() : undefined;

      if (!tokenAddress || !BSC_ADDRESS_RE.test(tokenAddress)) {
        const text = "I need a valid BSC token contract address (0x-prefixed, 40 hex chars).";
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      // ── Resolve amount ───────────────────────────────────────────────
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
        const text = "I need a positive numeric amount for the trade.";
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      // ── Resolve slippageBps ──────────────────────────────────────────
      const slippageBps =
        typeof params?.slippageBps === "number"
          ? params.slippageBps
          : typeof params?.slippageBps === "string" &&
              params.slippageBps.trim() !== ""
            ? Number(params.slippageBps)
            : 300;

      if (Number.isNaN(slippageBps) || slippageBps < 0) {
        const text = "slippageBps must be a non-negative number.";
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      logger.debug(
        `[EXECUTE_TRADE] resolved: side=${side} token=${tokenAddress} amount=${amountRaw} slippage=${slippageBps}`,
      );

      // ── POST to trade execution API ──────────────────────────────────
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
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          /* ignore json error */
        }
        const text = `Trade service failed: ${errMessage}`;
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      const rawData = await response.json();
      if (rawData.success !== true) {
        const text = `Trade failed: ${rawData.error || "Unknown error"}`;
        if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
        return { text, success: false };
      }

      const data = rawData as WalletTradeResponse;
      const text = formatTradeSuccess(data);

      if (callback) {
        callback({ text, action: "EXECUTE_TRADE_SUCCESS" });
      }

      return {
        text,
        success: true,
        values: {
          txHash: data.txHash,
          amountIn: data.amountIn,
          amountOut: data.amountOutStr || String(data.amountOut),
          explorerUrl: data.explorerUrl,
        },
        data: data as any,
      };
    } catch (err) {
      const text = `Trade execution failed: ${err instanceof Error ? err.message : String(err)}`;
      if (callback) callback({ text, action: "EXECUTE_TRADE_FAILED" });
      return { text, success: false };
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
      description:
        "BSC token contract address (0x-prefixed, 40 hex characters)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description:
        'Human-readable trade amount (e.g. "0.5" BNB for buys, or token amount for sells)',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "slippageBps",
      description: "Slippage tolerance in basis points (default 300 = 3%)",
      required: false,
      schema: { type: "number" as const },
    },
  ],

  examples: [
    [
      {
        name: "{{name1}}",
        content: { text: "Buy 0.1 BNB worth of CAKE on BSC" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll execute that buy order for you right now.",
          action: "EXECUTE_TRADE",
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: { text: "Can you swap 100 USDC for WBNB?" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I am preparing the trade. Please wait a moment while I route this transaction.",
          action: "EXECUTE_TRADE",
        },
      },
    ],
  ] as ActionExample[][],
};
