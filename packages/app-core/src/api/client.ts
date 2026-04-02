/**
 * API client for the Milady backend.
 *
 * Thin fetch wrapper + WebSocket for real-time chat/events.
 * Replaces the gateway WebSocket protocol entirely.
 *
 * The MiladyClient class is defined in client-base.ts and re-exported here.
 * Domain methods are defined via declaration merging + prototype augmentation
 * in the companion files: client-agent, client-chat, client-wallet,
 * client-cloud, client-skills.
 */

import type {
  AudioGenConfig,
  AudioGenProvider,
  CustomActionDef,
  CustomActionHandler,
  DatabaseProviderType,
  ImageConfig,
  ImageProvider,
  MediaConfig,
  MediaMode,
  ReleaseChannel,
  VideoConfig,
  VideoProvider,
  VisionConfig,
  VisionProvider,
} from "@miladyai/agent/contracts/config";
import type { DropStatus, MintResult } from "@miladyai/agent/contracts/drop";
import type {
  CloudProviderOption,
  InventoryProviderOption,
  MessageExample,
  MessageExampleContent,
  ModelOption,
  OnboardingConnection,
  OnboardingConnectorConfig as ConnectorConfig,
  OnboardingData,
  OnboardingOptions,
  OpenRouterModelOption,
  PiAiModelOption,
  ProviderOption,
  RpcProviderOption,
  StylePreset,
  SubscriptionProviderStatus,
  SubscriptionStatusResponse,
} from "@miladyai/shared/contracts/onboarding";
import type {
  AllPermissionsState,
  PermissionState,
  PermissionStatus,
  SystemPermissionDefinition,
  SystemPermissionId,
} from "@miladyai/agent/contracts/permissions";
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
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  SolanaNft,
  SolanaTokenBalance,
  StewardApprovalActionResponse,
  StewardApprovalInfo,
  StewardHistoryResponse,
  StewardPendingResponse,
  StewardPolicyResult,
  StewardStatusResponse,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletConfigUpdateRequest,
  WalletNftsResponse,
  WalletRpcChain,
  WalletRpcCredentialKey,
  WalletRpcSelections,
  TradePermissionMode as WalletTradePermissionMode,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "@miladyai/agent/contracts/wallet";
import type {
  StewardPendingApproval,
  StewardSignRequest,
  StewardSignResponse,
  StewardTxRecord,
  StewardTxStatus,
} from "@miladyai/shared/contracts/wallet";
import {
  DEFAULT_WALLET_RPC_SELECTIONS,
  normalizeWalletRpcProviderId,
  normalizeWalletRpcSelections,
  WALLET_RPC_PROVIDER_OPTIONS,
} from "@miladyai/agent/contracts/wallet";

export type {
  AllPermissionsState,
  AudioGenConfig,
  AudioGenProvider,
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  BscTransferExecuteRequest,
  BscTransferExecuteResponse,
  CloudProviderOption,
  ConnectorConfig,
  CustomActionDef,
  CustomActionHandler,
  DatabaseProviderType,
  DropStatus,
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  ImageConfig,
  ImageProvider,
  InventoryProviderOption,
  MediaConfig,
  MediaMode,
  MessageExample,
  MessageExampleContent,
  MintResult,
  ModelOption,
  OnboardingConnection,
  OnboardingData,
  OnboardingOptions,
  OpenRouterModelOption,
  PermissionState,
  PermissionStatus,
  PiAiModelOption,
  ProviderOption,
  ReleaseChannel,
  RpcProviderOption,
  SolanaNft,
  SolanaTokenBalance,
  StewardApprovalActionResponse,
  StewardApprovalInfo,
  StewardHistoryResponse,
  StewardPendingApproval,
  StewardPendingResponse,
  StewardPolicyResult,
  StewardSignRequest,
  StewardSignResponse,
  StewardStatusResponse,
  StewardTxRecord,
  StewardTxStatus,
  StylePreset,
  SubscriptionProviderStatus,
  SubscriptionStatusResponse,
  SystemPermissionDefinition as PermissionDefinition,
  SystemPermissionId,
  VerificationResult,
  VideoConfig,
  VideoProvider,
  VisionConfig,
  VisionProvider,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletConfigUpdateRequest,
  WalletNftsResponse,
  WalletRpcChain,
  WalletRpcCredentialKey,
  WalletRpcSelections,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
};

export {
  DEFAULT_WALLET_RPC_SELECTIONS,
  normalizeWalletRpcProviderId,
  normalizeWalletRpcSelections,
  WALLET_RPC_PROVIDER_OPTIONS,
};

export * from "./client-types";

// Re-export the class from client-base (no circular dependency issues)
export { MiladyClient } from "./client-base";

// ---------------------------------------------------------------------------
// Domain method augmentations (declaration merging + prototype assignment)
// These import MiladyClient from client-base directly, avoiding circular deps.
// ---------------------------------------------------------------------------

import "./client-agent";
import "./client-chat";
import "./client-wallet";
import "./client-cloud";
import "./client-skills";
import "./client-vincent";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

import { MiladyClient as _MiladyClient } from "./client-base";
export const client = new _MiladyClient();
