/**
 * TRANSFER_TOKEN action - transfers tokens or native BNB to another address.
 */

import type {
  Action,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
} from "@elizaos/core";
import {
  buildAuthHeaders,
  WALLET_ACTION_API_PORT,
  walletActionFetch,
} from "./wallet-action-shared";

const TRANSFER_TIMEOUT_MS = 60_000;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const VALID_CHAINS = ["bsc", "base", "solana"] as const;
type TransferChain = (typeof VALID_CHAINS)[number];

export const transferTokenAction: Action = {
  name: "TRANSFER_TOKEN",
  similes: ["SEND_TOKEN", "TRANSFER", "SEND", "SEND_BNB", "SEND_CRYPTO", "PAY"],
  description:
    "Transfer tokens on BSC, Base, or Solana. Use this when a user asks to send, transfer, or pay tokens to a recipient address.",
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    return Boolean(
      runtime.getSetting("EVM_PRIVATE_KEY") ||
        runtime.getSetting("SOLANA_PRIVATE_KEY") ||
        (runtime.getSetting("PRIVY_APP_ID") &&
          runtime.getSetting("PRIVY_AGENT_USER_ID")),
    );
  },
  handler: async (_runtime, _message, _state, options, callback?: HandlerCallback) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const rawChain =
        typeof params?.chain === "string"
          ? params.chain.trim().toLowerCase()
          : "bsc";
      const chain: TransferChain = VALID_CHAINS.includes(
        rawChain as TransferChain,
      )
        ? (rawChain as TransferChain)
        : "bsc";

      const toAddress =
        typeof params?.toAddress === "string"
          ? params.toAddress.trim()
          : undefined;
      const hasValidAddress =
        chain === "solana"
          ? Boolean(toAddress && SOLANA_ADDRESS_RE.test(toAddress))
          : Boolean(toAddress && EVM_ADDRESS_RE.test(toAddress));
      if (!hasValidAddress) {
        const text =
          chain === "solana"
            ? "I need a valid Solana recipient address (base58)."
            : "I need a valid recipient EVM address (0x-prefixed, 40 hex chars).";
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }

      const amountRaw =
        typeof params?.amount === "string"
          ? params.amount.trim()
          : typeof params?.amount === "number"
            ? String(params.amount)
            : undefined;
      if (
        !amountRaw ||
        Number.isNaN(Number(amountRaw)) ||
        Number(amountRaw) <= 0
      ) {
        const text = "I need a positive numeric amount for the transfer.";
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }

      const assetSymbol =
        typeof params?.assetSymbol === "string"
          ? params.assetSymbol.trim()
          : undefined;
      if (!assetSymbol) {
        const text =
          "I need an asset symbol (e.g. BNB, USDT, USDC) for the transfer.";
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }
      if (!/^[A-Za-z0-9]{1,20}$/.test(assetSymbol)) {
        const text = "Invalid asset symbol format.";
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }

      const tokenAddress =
        typeof params?.tokenAddress === "string" &&
        params.tokenAddress.trim() !== ""
          ? params.tokenAddress.trim()
          : undefined;
      if (tokenAddress && !EVM_ADDRESS_RE.test(tokenAddress)) {
        const text = "Invalid token address format.";
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }

      const body: Record<string, unknown> = {
        chain,
        toAddress,
        amount: amountRaw,
        assetSymbol,
        confirm: true,
      };
      if (tokenAddress) body.tokenAddress = tokenAddress;

      const response = await walletActionFetch(
        `http://127.0.0.1:${WALLET_ACTION_API_PORT}/api/wallet/transfer/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...buildAuthHeaders(),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as Record<
          string,
          string
        >;
        const text = `Transfer failed on ${chain.toUpperCase()}: ${errBody.error ?? `HTTP ${response.status}`}`;
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
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
        const text = `Transfer failed: ${result.error ?? "unknown error"}`;
        if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
        return { text, success: false };
      }

      if (result.executed && result.execution) {
        const text =
          `Transfer executed successfully on ${chain.toUpperCase()}! Sent ${amountRaw} ${assetSymbol} to ${toAddress} via ${result.mode} mode.\n` +
          `TX: ${result.execution.explorerUrl}\n` +
          `Status: ${result.execution.status}`;
        if (callback) callback({ text, action: "TRANSFER_TOKEN_SUCCESS" });
        return {
          text,
          success: true,
          values: {
            chain,
            toAddress,
            amount: amountRaw,
            assetSymbol,
            mode: result.mode,
            txHash: result.execution.hash,
            explorerUrl: result.execution.explorerUrl,
            executed: true,
          },
          data: {
            chain,
            toAddress,
            amount: amountRaw,
            assetSymbol,
            mode: result.mode,
            txHash: result.execution.hash,
            explorerUrl: result.execution.explorerUrl,
            executed: true,
          },
        };
      }

      const text =
        `Transfer prepared in ${result.mode} mode. ` +
        `A user signature is required to send ${amountRaw} ${assetSymbol} on ${chain.toUpperCase()} to ${toAddress}.`;
      if (callback) callback({ text, action: "TRANSFER_TOKEN_SUCCESS" });
      return {
        text,
        success: true,
        values: {
          chain,
          toAddress,
          amount: amountRaw,
          assetSymbol,
          mode: result.mode,
          requiresUserSignature: true,
          executed: false,
        },
        data: {
          chain,
          toAddress,
          amount: amountRaw,
          assetSymbol,
          mode: result.mode,
          requiresUserSignature: true,
          executed: false,
          unsignedTx: result.unsignedTx,
        },
      };
    } catch (err) {
      const text = `Transfer failed: ${err instanceof Error ? err.message : String(err)}`;
      if (callback) callback({ text, action: "TRANSFER_TOKEN_FAILED" });
      return { text, success: false };
    }
  },
  parameters: [
    {
      name: "toAddress",
      description: "Recipient EVM address (0x-prefixed, 40 hex characters)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: "Human-readable transfer amount (e.g. 1.5 BNB, 100 USDT).",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "assetSymbol",
      description: "Token symbol to transfer (e.g. BNB, USDT, USDC).",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "tokenAddress",
      description: "Token contract address for custom tokens (optional).",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "chain",
      description: 'Target chain: "bsc", "base", or "solana". Defaults to "bsc".',
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
