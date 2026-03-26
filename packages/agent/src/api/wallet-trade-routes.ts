import { ethers } from "ethers";
import type { ElizaConfig } from "../config/config";
import type {
  BscTradeQuoteResponse,
  BscUnsignedApprovalTx,
  BscUnsignedTradeTx,
} from "../contracts/wallet";
import type { WalletTradeLedgerRecordInput } from "./wallet-trading-profile";
import type { RouteRequestContext } from "./route-helpers";
import type { TradePermissionMode } from "./trade-safety";

type WalletAddresses = {
  evmAddress: string | null;
  solanaAddress: string | null;
};

type WalletRpcReadiness = {
  bscRpcUrls: string[];
  cloudManagedAccess: boolean;
};

type WalletForExecution = {
  address: string;
  sendTransaction: (
    tx: ethers.TransactionRequest,
  ) => Promise<{
    hash: string;
    gasLimit?: bigint;
    wait: (confirmations?: number) => Promise<{ status?: number } | null>;
  }>;
};

type ProviderForExecution = {
  getTransactionCount: (
    address: string,
    blockTag?: "pending" | "latest",
  ) => Promise<number>;
  destroy: () => void;
};

export interface WalletTradeExecuteDeps {
  getWalletAddresses: () => WalletAddresses;
  resolveWalletRpcReadiness: (config: ElizaConfig) => WalletRpcReadiness;
  resolveTradePermissionMode: (config: ElizaConfig) => TradePermissionMode;
  isAgentAutomationRequest: (
    req: RouteRequestContext["req"],
  ) => boolean;
  canUseLocalTradeExecution: (
    mode: TradePermissionMode,
    isAgentRequest: boolean,
  ) => boolean;
  buildBscTradeQuote: (args: {
    walletAddress: string | null;
    rpcUrls: string[];
    cloudManagedAccess: boolean;
    request: {
      side: "buy" | "sell";
      tokenAddress: string;
      amount: string;
      slippageBps?: number;
      routeProvider?: "auto" | "pancakeswap-v2" | "0x";
    };
  }) => Promise<BscTradeQuoteResponse>;
  buildBscBuyUnsignedTx: (
    quote: BscTradeQuoteResponse,
    walletAddress: string | null,
    deadlineSeconds?: number,
  ) => BscUnsignedTradeTx;
  buildBscSellUnsignedTx: (
    quote: BscTradeQuoteResponse,
    walletAddress: string | null,
    deadlineSeconds?: number,
  ) => BscUnsignedTradeTx;
  buildBscApproveUnsignedTx: (
    tokenAddress: string,
    walletAddress: string | null,
    spender: string,
    amountWei: string,
  ) => BscUnsignedApprovalTx;
  resolveBscApprovalSpender: (quote: BscTradeQuoteResponse) => string;
  resolvePrimaryBscRpcUrl: (args: {
    rpcUrls: string[];
    cloudManagedAccess: boolean;
  }) => string | null;
  assertQuoteFresh: (quotedAt?: number) => void;
  recordWalletTradeLedgerEntry: (input: WalletTradeLedgerRecordInput) => void;
  createProvider: (rpcUrl: string) => ProviderForExecution;
  createWallet: (privateKey: string, provider: ProviderForExecution) => WalletForExecution;
  logger: {
    warn: (message: string) => void;
    error: (message: string) => void;
  };
}

export interface WalletTradeExecuteRouteContext extends RouteRequestContext {
  state: {
    config: ElizaConfig;
  };
  deps: WalletTradeExecuteDeps;
}

export async function handleWalletTradeExecuteRoute(
  ctx: WalletTradeExecuteRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error, state, deps } =
    ctx;

  if (!(method === "POST" && pathname === "/api/wallet/trade/execute")) {
    return false;
  }

  const body = await readJsonBody<{
    side?: string;
    tokenAddress?: string;
    amount?: string;
    slippageBps?: number;
    routeProvider?: "auto" | "pancakeswap-v2" | "0x";
    deadlineSeconds?: number;
    confirm?: boolean;
    source?: "agent" | "manual";
  }>(req, res);
  if (!body) return true;

  if (!body.side || !body.tokenAddress || !body.amount) {
    error(res, "side, tokenAddress, and amount are required", 400);
    return true;
  }

  const tradePermissionMode = deps.resolveTradePermissionMode(state.config);
  const isAgentRequest = deps.isAgentAutomationRequest(req);
  const hasLocalKey = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
  const canExecuteLocally = deps.canUseLocalTradeExecution(
    tradePermissionMode,
    isAgentRequest,
  );
  const addrs = deps.getWalletAddresses();
  const walletRpcReadiness = deps.resolveWalletRpcReadiness(state.config);

  try {
    const quote = await deps.buildBscTradeQuote({
      walletAddress: addrs.evmAddress ?? null,
      rpcUrls: walletRpcReadiness.bscRpcUrls,
      cloudManagedAccess: walletRpcReadiness.cloudManagedAccess,
      request: {
        side: body.side as "buy" | "sell",
        tokenAddress: body.tokenAddress,
        amount: body.amount,
        slippageBps: body.slippageBps,
        routeProvider: body.routeProvider,
      },
    });

    const walletAddress = addrs.evmAddress ?? null;
    const unsignedTx =
      quote.side === "buy"
        ? deps.buildBscBuyUnsignedTx(quote, walletAddress, body.deadlineSeconds)
        : deps.buildBscSellUnsignedTx(quote, walletAddress, body.deadlineSeconds);

    let unsignedApprovalTx: BscUnsignedApprovalTx | undefined;
    let requiresApproval = false;
    if (quote.side === "sell" && walletAddress) {
      unsignedApprovalTx = deps.buildBscApproveUnsignedTx(
        quote.tokenAddress,
        walletAddress,
        deps.resolveBscApprovalSpender(quote),
        quote.quoteIn.amountWei,
      );
      requiresApproval = true;
    }

    if (!hasLocalKey || !canExecuteLocally || body.confirm !== true) {
      json(res, {
        ok: true,
        side: quote.side,
        mode: hasLocalKey && canExecuteLocally ? "local-key" : "user-sign",
        quote,
        executed: false,
        requiresUserSignature: true,
        unsignedTx,
        unsignedApprovalTx,
        requiresApproval,
      });
      return true;
    }

    const rpcUrl = deps.resolvePrimaryBscRpcUrl({
      rpcUrls: walletRpcReadiness.bscRpcUrls,
      cloudManagedAccess: walletRpcReadiness.cloudManagedAccess,
    });
    if (!rpcUrl) {
      error(res, "BSC RPC not configured for local execution.", 503);
      return true;
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? "";
    const provider = deps.createProvider(rpcUrl);
    const wallet = deps.createWallet(
      evmKey.startsWith("0x") ? evmKey : `0x${evmKey}`,
      provider,
    );

    deps.assertQuoteFresh(quote.quotedAt);

    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    let approvalHash: string | undefined;

    if (requiresApproval && unsignedApprovalTx) {
      const approvalTxReq: ethers.TransactionRequest = {
        to: unsignedApprovalTx.to,
        data: unsignedApprovalTx.data,
        value: BigInt(unsignedApprovalTx.valueWei),
        chainId: unsignedApprovalTx.chainId,
        nonce,
      };
      const approvalResponse = await wallet.sendTransaction(approvalTxReq);
      approvalHash = approvalResponse.hash;
      const approvalReceipt = await approvalResponse.wait(1);
      if (!approvalReceipt || approvalReceipt.status === 0) {
        throw new Error("Token approval transaction reverted on-chain");
      }
    }

    const tradeNonce = requiresApproval
      ? await provider.getTransactionCount(wallet.address, "pending")
      : nonce;

    const tradeTxReq: ethers.TransactionRequest = {
      to: unsignedTx.to,
      data: unsignedTx.data,
      value: BigInt(unsignedTx.valueWei),
      chainId: unsignedTx.chainId,
      nonce: tradeNonce,
    };
    const tradeTxResponse = await wallet.sendTransaction(tradeTxReq);

    const executionResult = {
      hash: tradeTxResponse.hash,
      nonce: tradeNonce,
      gasLimit: tradeTxResponse.gasLimit?.toString() ?? "0",
      valueWei: unsignedTx.valueWei,
      explorerUrl: `https://bscscan.com/tx/${tradeTxResponse.hash}`,
      blockNumber: null as number | null,
      status: "submitted" as "submitted" | "success",
      approvalHash,
    };

    const source = body.source ?? "manual";
    try {
      deps.recordWalletTradeLedgerEntry({
        hash: tradeTxResponse.hash,
        source,
        side: quote.side,
        tokenAddress: quote.tokenAddress,
        slippageBps: quote.slippageBps,
        route: quote.route,
        quoteIn: {
          symbol: quote.quoteIn.symbol,
          amount: quote.quoteIn.amount,
          amountWei: quote.quoteIn.amountWei,
        },
        quoteOut: {
          symbol: quote.quoteOut.symbol,
          amount: quote.quoteOut.amount,
          amountWei: quote.quoteOut.amountWei,
        },
        status: "pending",
        confirmations: 0,
        nonce: tradeNonce,
        blockNumber: null,
        gasUsed: null,
        effectiveGasPriceWei: null,
        explorerUrl: executionResult.explorerUrl,
      });
    } catch (ledgerErr) {
      deps.logger.warn(
        `[api] Failed to record trade ledger entry (attempt 1): ${
          ledgerErr instanceof Error ? ledgerErr.message : ledgerErr
        }`,
      );
      try {
        deps.recordWalletTradeLedgerEntry({
          hash: tradeTxResponse.hash,
          source,
          side: quote.side,
          tokenAddress: quote.tokenAddress,
          slippageBps: quote.slippageBps,
          route: quote.route,
          quoteIn: {
            symbol: quote.quoteIn.symbol,
            amount: quote.quoteIn.amount,
            amountWei: quote.quoteIn.amountWei,
          },
          quoteOut: {
            symbol: quote.quoteOut.symbol,
            amount: quote.quoteOut.amount,
            amountWei: quote.quoteOut.amountWei,
          },
          status: "pending",
          confirmations: 0,
          nonce: tradeNonce,
          blockNumber: null,
          gasUsed: null,
          effectiveGasPriceWei: null,
          explorerUrl: executionResult.explorerUrl,
        });
      } catch (retryErr) {
        deps.logger.error(
          `[api] Ledger entry retry also failed: ${
            retryErr instanceof Error ? retryErr.message : retryErr
          }`,
        );
      }
    }

    provider.destroy();

    json(res, {
      ok: true,
      side: quote.side,
      mode: "local-key",
      quote,
      executed: true,
      requiresUserSignature: false,
      unsignedTx,
      unsignedApprovalTx,
      requiresApproval,
      execution: executionResult,
    });
  } catch (err) {
    deps.logger.error(
      `[api] BSC trade execute failed: ${err instanceof Error ? err.message : err}`,
    );
    error(
      res,
      `Trade execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
      500,
    );
  }

  return true;
}
