/**
 * Wallet domain methods — wallet addresses/balances, BSC trading, steward,
 * trading profile, registry (ERC-8004), drop/mint, whitelist, twitter verify.
 */

import type { DropStatus, MintResult } from "@miladyai/agent/contracts/drop";
import type { VerificationResult } from "@miladyai/agent/contracts/verification";
import type {
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  BscTransferExecuteRequest,
  BscTransferExecuteResponse,
  StewardApprovalActionResponse,
  StewardHistoryResponse,
  StewardPendingResponse,
  StewardStatusResponse,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletConfigUpdateRequest,
  WalletNftsResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
  WalletTradingProfileResponse,
} from "@miladyai/agent/contracts/wallet";
import type {
  StewardSignRequest,
  StewardSignResponse,
} from "@miladyai/shared/contracts/wallet";
import type {
  ApplyProductionWalletDefaultsResponse,
  RegistrationResult,
  RegistryConfig,
  RegistryStatus,
  VerificationMessageResponse,
  WalletExportResult,
  WhitelistStatus,
} from "./client-types";
import { MiladyClient } from "./client-base";

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    getWalletAddresses(): Promise<WalletAddresses>;
    getWalletBalances(): Promise<WalletBalancesResponse>;
    getWalletNfts(): Promise<WalletNftsResponse>;
    getWalletConfig(): Promise<WalletConfigStatus>;
    updateWalletConfig(
      config: WalletConfigUpdateRequest,
    ): Promise<{ ok: boolean }>;
    exportWalletKeys(exportToken: string): Promise<WalletExportResult>;
    getBscTradePreflight(
      tokenAddress?: string,
    ): Promise<BscTradePreflightResponse>;
    getBscTradeQuote(
      request: BscTradeQuoteRequest,
    ): Promise<BscTradeQuoteResponse>;
    executeBscTrade(
      request: BscTradeExecuteRequest,
    ): Promise<BscTradeExecuteResponse>;
    executeBscTransfer(
      request: BscTransferExecuteRequest,
    ): Promise<BscTransferExecuteResponse>;
    getBscTradeTxStatus(hash: string): Promise<BscTradeTxStatusResponse>;
    getStewardStatus(): Promise<StewardStatusResponse>;
    getStewardPolicies(): Promise<
      Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>
    >;
    setStewardPolicies(
      policies: Array<{
        id: string;
        type: string;
        enabled: boolean;
        config: Record<string, unknown>;
      }>,
    ): Promise<void>;
    getStewardHistory(opts?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{
      records: StewardHistoryResponse;
      total: number;
      offset: number;
      limit: number;
    }>;
    getStewardPending(): Promise<StewardPendingResponse>;
    approveStewardTx(txId: string): Promise<StewardApprovalActionResponse>;
    rejectStewardTx(
      txId: string,
      reason?: string,
    ): Promise<StewardApprovalActionResponse>;
    signViaSteward(request: StewardSignRequest): Promise<StewardSignResponse>;
    getWalletTradingProfile(
      window?: WalletTradingProfileWindow,
      source?: WalletTradingProfileSourceFilter,
    ): Promise<WalletTradingProfileResponse>;
    applyProductionWalletDefaults(): Promise<ApplyProductionWalletDefaultsResponse>;
    getRegistryStatus(): Promise<RegistryStatus>;
    registerAgent(params?: {
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }): Promise<RegistrationResult>;
    updateRegistryTokenURI(
      tokenURI: string,
    ): Promise<{ ok: boolean; txHash: string }>;
    syncRegistryProfile(params?: {
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }): Promise<{ ok: boolean; txHash: string }>;
    getRegistryConfig(): Promise<RegistryConfig>;
    getDropStatus(): Promise<DropStatus>;
    mintAgent(params?: {
      name?: string;
      endpoint?: string;
      shiny?: boolean;
    }): Promise<MintResult>;
    mintAgentWhitelist(params: {
      name?: string;
      endpoint?: string;
      proof: string[];
    }): Promise<MintResult>;
    getWhitelistStatus(): Promise<WhitelistStatus>;
    generateTwitterVerificationMessage(): Promise<VerificationMessageResponse>;
    verifyTwitter(tweetUrl: string): Promise<VerificationResult>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

MiladyClient.prototype.getWalletAddresses = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/wallet/addresses");
};

MiladyClient.prototype.getWalletBalances = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/balances");
};

MiladyClient.prototype.getWalletNfts = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/nfts");
};

MiladyClient.prototype.getWalletConfig = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/config");
};

MiladyClient.prototype.updateWalletConfig = async function (
  this: MiladyClient,
  config,
) {
  return this.fetch("/api/wallet/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

MiladyClient.prototype.exportWalletKeys = async function (
  this: MiladyClient,
  exportToken,
) {
  return this.fetch("/api/wallet/export", {
    method: "POST",
    body: JSON.stringify({ confirm: true, exportToken }),
  });
};

MiladyClient.prototype.getBscTradePreflight = async function (
  this: MiladyClient,
  tokenAddress?,
) {
  return this.fetch("/api/wallet/trade/preflight", {
    method: "POST",
    body: JSON.stringify(
      tokenAddress?.trim() ? { tokenAddress: tokenAddress.trim() } : {},
    ),
  });
};

MiladyClient.prototype.getBscTradeQuote = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/wallet/trade/quote", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.executeBscTrade = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/wallet/trade/execute", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.executeBscTransfer = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/wallet/transfer/execute", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.getBscTradeTxStatus = async function (
  this: MiladyClient,
  hash,
) {
  return this.fetch(
    `/api/wallet/trade/tx-status?hash=${encodeURIComponent(hash)}`,
  );
};

MiladyClient.prototype.getStewardStatus = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/steward-status");
};

MiladyClient.prototype.getStewardPolicies = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/wallet/steward-policies");
};

MiladyClient.prototype.setStewardPolicies = async function (
  this: MiladyClient,
  policies,
) {
  await this.fetch("/api/wallet/steward-policies", {
    method: "PUT",
    body: JSON.stringify({ policies }),
  });
};

MiladyClient.prototype.getStewardHistory = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return this.fetch(`/api/wallet/steward-tx-records${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getStewardPending = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/steward-pending-approvals");
};

MiladyClient.prototype.approveStewardTx = async function (
  this: MiladyClient,
  txId,
) {
  return this.fetch("/api/wallet/steward-approve-tx", {
    method: "POST",
    body: JSON.stringify({ txId }),
  });
};

MiladyClient.prototype.rejectStewardTx = async function (
  this: MiladyClient,
  txId,
  reason?,
) {
  return this.fetch("/api/wallet/steward-deny-tx", {
    method: "POST",
    body: JSON.stringify({ txId, reason }),
  });
};

MiladyClient.prototype.signViaSteward = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/wallet/steward-sign", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.getWalletTradingProfile = async function (
  this: MiladyClient,
  window = "30d",
  source = "all",
) {
  const params = new URLSearchParams({ window, source });
  return this.fetch(`/api/wallet/trading/profile?${params.toString()}`);
};

MiladyClient.prototype.applyProductionWalletDefaults = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/wallet/production-defaults", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
};

MiladyClient.prototype.getRegistryStatus = async function (this: MiladyClient) {
  return this.fetch("/api/registry/status");
};

MiladyClient.prototype.registerAgent = async function (
  this: MiladyClient,
  params?,
) {
  return this.fetch("/api/registry/register", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

MiladyClient.prototype.updateRegistryTokenURI = async function (
  this: MiladyClient,
  tokenURI,
) {
  return this.fetch("/api/registry/update-uri", {
    method: "POST",
    body: JSON.stringify({ tokenURI }),
  });
};

MiladyClient.prototype.syncRegistryProfile = async function (
  this: MiladyClient,
  params?,
) {
  return this.fetch("/api/registry/sync", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

MiladyClient.prototype.getRegistryConfig = async function (this: MiladyClient) {
  return this.fetch("/api/registry/config");
};

MiladyClient.prototype.getDropStatus = async function (this: MiladyClient) {
  return this.fetch("/api/drop/status");
};

MiladyClient.prototype.mintAgent = async function (
  this: MiladyClient,
  params?,
) {
  return this.fetch("/api/drop/mint", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
};

MiladyClient.prototype.mintAgentWhitelist = async function (
  this: MiladyClient,
  params,
) {
  return this.fetch("/api/drop/mint-whitelist", {
    method: "POST",
    body: JSON.stringify(params),
  });
};

MiladyClient.prototype.getWhitelistStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/whitelist/status");
};

MiladyClient.prototype.generateTwitterVerificationMessage = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/whitelist/twitter/message", { method: "POST" });
};

MiladyClient.prototype.verifyTwitter = async function (
  this: MiladyClient,
  tweetUrl,
) {
  return this.fetch("/api/whitelist/twitter/verify", {
    method: "POST",
    body: JSON.stringify({ tweetUrl }),
  });
};
