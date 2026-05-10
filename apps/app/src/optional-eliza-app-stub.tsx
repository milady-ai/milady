import type {
  CompanionSceneStatus,
  CompanionShellComponentProps,
  VincentStateHookArgs,
  VincentStateHookResult,
} from "@elizaos/app-core";
import type {
  DropStatus,
  MintResult,
  RegistryStatus,
  WalletExportResult,
  WhitelistStatus,
} from "@elizaos/app-core/api";
import type { InventoryChainFilters } from "@elizaos/app-core/state/types";
import type {
  WalletAddresses,
  WalletBalancesResponse,
  WalletChainKind,
  WalletConfigStatus,
  WalletConfigUpdateRequest,
  WalletEntry,
  WalletNftsResponse,
  WalletPrimaryMap,
  WalletRpcChain,
  WalletRpcCredentialKey,
  WalletRpcSelections,
} from "@elizaos/shared";
import type { ComponentType } from "react";
import * as THREE from "three";

const EmptyComponent: ComponentType = () => null;

export function CompanionShell(_props: CompanionShellComponentProps): null {
  return null;
}
export const GlobalEmoteOverlay = EmptyComponent;
export const InferenceCloudAlertButton = EmptyComponent;
export const LifeOpsActivitySignalsEffect = EmptyComponent;
export const AppBlockerSettingsCard = EmptyComponent;
export const LifeOpsBrowserSetupPanel = EmptyComponent;
export const LifeOpsPageView = EmptyComponent;
export const WebsiteBlockerSettingsCard = EmptyComponent;
export const ApprovalQueue = EmptyComponent;
export const StewardLogo = EmptyComponent;
export const TransactionHistory = EmptyComponent;
export const CodingAgentControlChip = EmptyComponent;
export const CodingAgentSettingsSection = EmptyComponent;
export const CodingAgentTasksPanel = EmptyComponent;
export const PtyConsoleDrawer = EmptyComponent;
export const FineTuningView = EmptyComponent;

// Restored from before upstream 0a75bd6eb dropped it — main.tsx still imports
// `prefetchVrmToCache` and registers it on the boot config (used by
// startup-phase-hydrate to warm the VRM cache before companion mount).
export function prefetchVrmToCache(_url?: string): Promise<void> {
  return Promise.resolve();
}

export function createVectorBrowserRenderer(): Promise<null> {
  return Promise.resolve(null);
}

export function resolveCompanionInferenceNotice(): null {
  return null;
}

// Stubs for @elizaos/app-wallet — the canonical wallet UI ships in
// eliza/plugins/app-wallet, but the host app sometimes aliases the
// whole package to this no-op stub (Capacitor / minimal builds without
// wallet surface). Each export below mirrors a real symbol that
// @elizaos/app-core source files import so typecheck stays green.
export function buildWalletRpcUpdateRequest(_args: {
  walletConfig?: unknown;
  rpcFieldValues: Partial<Record<WalletRpcCredentialKey, string>>;
  selectedProviders:
    | WalletRpcSelections
    | Partial<Record<WalletRpcChain, string | null | undefined>>;
  selectedNetwork?: "mainnet" | "testnet";
}): WalletConfigUpdateRequest {
  return {
    credentials: {},
    selections: {},
  } as WalletConfigUpdateRequest;
}

export function resolveInitialWalletRpcSelections(
  _walletConfig?: unknown,
): WalletRpcSelections {
  return {} as WalletRpcSelections;
}

// Inventory constants + helpers
export const BSC_GAS_THRESHOLD = 0.005;
export const BSC_GAS_READY_THRESHOLD = 0.005;
export const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Chain config types — minimal shape used by app-core when @elizaos/app-wallet
// is stubbed. The real plugin enumerates many chains; the stub keeps the
// type closed but exposes an empty config map at runtime.
export type ChainKey =
  | "bsc"
  | "avax"
  | "solana"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "polygon"
  | "optimism";
export interface ChainConfig {
  chainKey: ChainKey;
  name: string;
  [key: string]: unknown;
}
export const CHAIN_CONFIGS: Record<ChainKey, ChainConfig> = {} as Record<
  ChainKey,
  ChainConfig
>;
export const PRIMARY_CHAIN_KEYS: readonly ChainKey[] = [];

export function isAvaxChainName(_chain: string): boolean {
  return false;
}
export function isBscChainName(_chain: string): boolean {
  return false;
}
export function toNormalizedAddress(addr: string): string {
  return addr;
}
export function getNativeLogoUrl(_chain: string): string | null {
  return null;
}
export function getStablecoinAddress(_chain: string): string | null {
  return null;
}
export function resolveChainKey(_chain: string): ChainKey | null {
  return null;
}
export function getChainConfig(_chainName: string): ChainConfig | null {
  return null;
}
export function getContractLogoUrl(
  _chain: string,
  _address: string,
): string | null {
  return null;
}
export function getExplorerTokenUrl(
  _chain: string,
  _address: string,
): string | null {
  return null;
}
export function getExplorerTxUrl(
  _chain: string,
  _txHash: string,
): string | null {
  return null;
}
export function chainKeyToWalletRpcChain(
  _chainKey: ChainKey,
): WalletRpcChain | null {
  return null;
}

export interface TokenRow {
  chain: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  logoUrl: string | null;
  [key: string]: unknown;
}
export interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
  [key: string]: unknown;
}

export const InventoryView = EmptyComponent;
export const TokenLogo = EmptyComponent;
export const ChainIcon = EmptyComponent;

export function useInventoryData(): {
  tokens: readonly TokenRow[];
  nfts: readonly NftItem[];
  loading: boolean;
} {
  return { tokens: [], nfts: [], loading: false };
}

// Wallet sidebar widget. Component prop type comes from
// @elizaos/app-core/components/chat/widgets/types so the seed registry
// accepts this stub as a valid ChatSidebarWidgetDefinition.
import type { ChatSidebarWidgetDefinition } from "@elizaos/app-core/components/chat/widgets/types";
export const WALLET_STATUS_WIDGET: ChatSidebarWidgetDefinition = {
  id: "wallet.status",
  pluginId: "wallet",
  order: 70,
  defaultEnabled: false,
  Component: EmptyComponent as ChatSidebarWidgetDefinition["Component"],
};

// useWalletState return shape — mirrors the destructure at
// eliza/packages/app-core/src/state/AppContext.tsx so consumers don't see
// `unknown` for any field they pull off the hook.
export interface WalletStateHook {
  state: {
    browserEnabled: boolean;
    computerUseEnabled: boolean;
    walletEnabled: boolean;
    walletAddresses: WalletAddresses | null;
    walletConfig: WalletConfigStatus | null;
    walletBalances: WalletBalancesResponse | null;
    walletNfts: WalletNftsResponse | null;
    walletLoading: boolean;
    walletNftsLoading: boolean;
    inventoryView: "tokens" | "nfts";
    walletExportData: WalletExportResult | null;
    walletExportVisible: boolean;
    walletApiKeySaving: boolean;
    inventorySort: "symbol" | "value" | "chain";
    inventorySortDirection: "asc" | "desc";
    inventoryChainFilters: InventoryChainFilters;
    walletError: string | null;
    registryStatus: RegistryStatus | null;
    registryLoading: boolean;
    registryRegistering: boolean;
    registryError: string | null;
    dropStatus: DropStatus | null;
    dropLoading: boolean;
    mintInProgress: boolean;
    mintResult: MintResult | null;
    mintError: string | null;
    mintShiny: boolean;
    whitelistStatus: WhitelistStatus | null;
    whitelistLoading: boolean;
    wallets: WalletEntry[];
    walletPrimary: WalletPrimaryMap | null;
    walletPrimaryRestarting: Partial<Record<WalletChainKind, boolean>>;
    walletPrimaryPending: Partial<Record<WalletChainKind, boolean>>;
    cloudRefreshing: boolean;
  };
  setBrowserEnabled: (v: boolean) => void;
  setComputerUseEnabled: (v: boolean) => void;
  setWalletEnabled: (v: boolean) => void;
  setWalletAddresses: (v: WalletAddresses) => void;
  setInventoryView: (v: "tokens" | "nfts") => void;
  setInventorySort: (v: "symbol" | "value" | "chain") => void;
  setInventorySortDirection: (v: "asc" | "desc") => void;
  setInventoryChainFilters: (v: InventoryChainFilters) => void;
  loadWalletConfig: () => Promise<void>;
  loadBalances: () => Promise<void>;
  loadNfts: () => Promise<void>;
  handleWalletApiKeySave: (req: WalletConfigUpdateRequest) => Promise<boolean>;
  handleExportKeys: () => Promise<void>;
  loadRegistryStatus: () => Promise<void>;
  registerOnChain: () => Promise<void>;
  syncRegistryProfile: () => Promise<void>;
  loadDropStatus: () => Promise<void>;
  mintFromDrop: () => Promise<void>;
  loadWhitelistStatus: () => Promise<void>;
  setPrimary: (chain: string, walletId: string) => Promise<void>;
  refreshCloud: () => Promise<void>;
}

const noop = () => {};
const noopAsync = async () => {};

export function useWalletState(_args: {
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
    once?: boolean,
    busy?: boolean,
  ) => void;
  promptModal?: unknown;
  agentName?: string;
  characterName?: string;
}): WalletStateHook {
  return {
    state: {
      browserEnabled: false,
      computerUseEnabled: false,
      walletEnabled: false,
      walletAddresses: null,
      walletConfig: null,
      walletBalances: null,
      walletNfts: null,
      walletLoading: false,
      walletNftsLoading: false,
      inventoryView: "tokens",
      walletExportData: null,
      walletExportVisible: false,
      walletApiKeySaving: false,
      inventorySort: "symbol",
      inventorySortDirection: "asc",
      inventoryChainFilters: {} as InventoryChainFilters,
      walletError: null,
      registryStatus: null,
      registryLoading: false,
      registryRegistering: false,
      registryError: null,
      dropStatus: null,
      dropLoading: false,
      mintInProgress: false,
      mintResult: null,
      mintError: null,
      mintShiny: false,
      whitelistStatus: null,
      whitelistLoading: false,
      wallets: [],
      walletPrimary: null,
      walletPrimaryRestarting: {},
      walletPrimaryPending: {},
      cloudRefreshing: false,
    },
    setBrowserEnabled: noop,
    setComputerUseEnabled: noop,
    setWalletEnabled: noop,
    setWalletAddresses: noop,
    setInventoryView: noop,
    setInventorySort: noop,
    setInventorySortDirection: noop,
    setInventoryChainFilters: noop,
    loadWalletConfig: noopAsync,
    loadBalances: noopAsync,
    loadNfts: noopAsync,
    handleWalletApiKeySave: async () => true,
    handleExportKeys: noopAsync,
    loadRegistryStatus: noopAsync,
    registerOnChain: noopAsync,
    syncRegistryProfile: noopAsync,
    loadDropStatus: noopAsync,
    mintFromDrop: noopAsync,
    loadWhitelistStatus: noopAsync,
    setPrimary: noopAsync,
    refreshCloud: noopAsync,
  };
}

export function useCompanionSceneStatus(): CompanionSceneStatus {
  return { avatarReady: false, teleportKey: "" };
}

export function useVincentState(
  _args: VincentStateHookArgs,
): VincentStateHookResult {
  return {
    vincentConnected: false,
    vincentLoginBusy: false,
    vincentLoginError: null,
    vincentConnectedAt: null,
    handleVincentLogin: async () => {},
    handleVincentDisconnect: async () => {},
    pollVincentStatus: async () => false,
  };
}

export function dispatchQueuedLifeOpsGithubCallbackFromUrl(
  _url?: string,
): void {}

export type PreflightAuthStatus =
  | "authenticated"
  | "unauthenticated"
  | "unknown";

export interface NormalizedPreflightAuth {
  status: PreflightAuthStatus;
  method?: string;
  detail?: string;
  loginHint?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePreflightAuth(
  raw: unknown,
): NormalizedPreflightAuth | undefined {
  if (!isRecord(raw)) return undefined;
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: PreflightAuthStatus =
    rawStatus === "authenticated" || rawStatus === "unauthenticated"
      ? rawStatus
      : "unknown";
  const out: NormalizedPreflightAuth = { status };
  if (typeof raw.method === "string") out.method = raw.method;
  if (typeof raw.detail === "string") out.detail = raw.detail;
  if (typeof raw.loginHint === "string") out.loginHint = raw.loginHint;
  return out;
}

export interface SanitizedAuthResult {
  launched?: boolean;
  url?: string;
  deviceCode?: string;
  instructions?: string;
}

export function sanitizeAuthResult(input: unknown): SanitizedAuthResult {
  if (!isRecord(input)) return {};
  const out: SanitizedAuthResult = {};
  if (typeof input.launched === "boolean") out.launched = input.launched;
  if (typeof input.url === "string") {
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        out.url = input.url;
      }
    } catch {
      // Drop malformed URLs; the UI can fall back to instructions.
    }
  }
  if (typeof input.deviceCode === "string") {
    out.deviceCode = input.deviceCode;
  }
  if (typeof input.instructions === "string") {
    out.instructions = input.instructions;
  }
  return out;
}

export type CoordinationDecisionKind =
  | "respond"
  | "escalate"
  | "ignore"
  | "complete"
  | "auto_resolved"
  | "stopped";

export interface CoordinationDecision {
  timestamp: number;
  event: string;
  promptText: string;
  decision: CoordinationDecisionKind;
  response?: string;
  reasoning: string;
}

export type CoordinatorTaskStatus =
  | "active"
  | "blocked"
  | "tool_running"
  | "completed"
  | "error"
  | "stopped";

export interface TaskContext {
  threadId: string;
  taskNodeId?: string;
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
  repo?: string;
  originRoomId?: string;
  originMetadata?: Record<string, unknown>;
  status: CoordinatorTaskStatus;
  decisions: CoordinationDecision[];
  autoResolvedCount: number;
  registeredAt: number;
  lastActivityAt: number;
  idleCheckCount: number;
  taskDelivered: boolean;
  completionSummary?: string;
  lastSeenDecisionIndex: number;
  lastInputSentAt?: number;
  stoppedAt?: number;
}

export interface SwarmEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: unknown;
}

export interface TaskCompletionSummary {
  sessionId: string;
  label: string;
  agentType: string;
  originalTask: string;
  status: string;
  completionSummary: string;
  [key: string]: unknown;
}

export { THREE };

// ── @elizaos/app-wallet/wallet-rpc helpers ─────────────────────────────
// `buildWalletRpcUpdateRequest` is already declared earlier in this file
// (typed against WalletRpcCredentialKey/WalletRpcSelections); upstream
// 49778114a5 accidentally re-added an `_args: unknown` copy that broke the
// renderer build with "Multiple exports with the same name". The two helpers
// below are the unique additions from that commit and stay.
export function normalizeWalletRpcSelections(
  _selections: unknown,
): Record<string, never> {
  return {};
}

export function collectSelectedCredentialKeys(_selections: unknown): string[] {
  return [];
}
