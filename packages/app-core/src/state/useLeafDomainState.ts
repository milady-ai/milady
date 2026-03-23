/**
 * Leaf domain state hooks — smaller domains consolidated via useReducer.
 *
 * Each hook replaces a group of related useState hooks from AppContext.
 * These domains are mostly independent and only used by 1-3 components each.
 */

import { useCallback, useReducer, useRef } from "react";
import type {
  CatalogSkill,
  CharacterData,
  DropStatus,
  ExtensionStatus,
  LogEntry,
  McpMarketplaceResult,
  McpRegistryServerDetail,
  McpServerConfig,
  McpServerStatus,
  MintResult,
  PluginInfo,
  RegistryPlugin,
  RegistryStatus,
  SkillInfo,
  SkillMarketplaceResult,
  SkillScanReportSummary,
  TriggerHealthSnapshot,
  TriggerRunRecord,
  TriggerSummary,
  UpdateStatus,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletExportResult,
  WalletNftsResponse,
  WhitelistStatus,
  WorkbenchOverview,
} from "../api";
import type { GamePostMessageAuthPayload } from "./types";

// ── Generic leaf reducer factory ───────────────────────────────────────

type LeafAction<S> =
  | { type: "SET"; field: keyof S; value: unknown }
  | { type: "MERGE"; partial: Partial<S> };

// biome-ignore lint/suspicious/noExplicitAny: generic leaf state can hold any value
function leafReducer<S extends Record<string, any>>(
  state: S,
  action: LeafAction<S>,
): S {
  switch (action.type) {
    case "SET":
      if (state[action.field] === action.value) return state;
      return { ...state, [action.field]: action.value };
    case "MERGE":
      return { ...state, ...action.partial };
    default:
      return state;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: generic leaf state can hold any value
function useLeafState<S extends Record<string, any>>(initialState: S) {
  const [state, dispatch] = useReducer(leafReducer<S>, initialState);
  const set = useCallback(<K extends keyof S>(field: K, value: S[K]) => {
    dispatch({ type: "SET", field, value });
  }, []);
  const merge = useCallback(
    (partial: Partial<S>) => dispatch({ type: "MERGE", partial }),
    [],
  );
  return { state, dispatch, set, merge } as const;
}

// ── Wallet / Inventory ─────────────────────────────────────────────────

export interface WalletState {
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
  inventorySort: "chain" | "symbol" | "value";
  inventoryChainFocus: string;
  walletError: string | null;
  // Registry
  registryStatus: RegistryStatus | null;
  registryLoading: boolean;
  registryRegistering: boolean;
  registryError: string | null;
  // Drop / Mint
  dropStatus: DropStatus | null;
  dropLoading: boolean;
  mintInProgress: boolean;
  mintResult: MintResult | null;
  mintError: string | null;
  mintShiny: boolean;
  // Whitelist
  whitelistStatus: WhitelistStatus | null;
  whitelistLoading: boolean;
}

const INITIAL_WALLET: WalletState = {
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
  inventorySort: "value",
  inventoryChainFocus: "all",
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
};

export function useWalletState() {
  const hook = useLeafState(INITIAL_WALLET);
  const walletApiKeySavingRef = useRef(false);
  const exportBusyRef = useRef(false);
  const importBusyRef = useRef(false);
  return { ...hook, walletApiKeySavingRef, exportBusyRef, importBusyRef };
}

// ── Plugins ────────────────────────────────────────────────────────────

export interface PluginsState {
  plugins: PluginInfo[];
  pluginFilter: "all" | "ai-provider" | "connector" | "feature" | "streaming";
  pluginStatusFilter: "all" | "enabled" | "disabled";
  pluginSearch: string;
  pluginSettingsOpen: Set<string>;
  pluginAdvancedOpen: Set<string>;
  pluginSaving: Set<string>;
  pluginSaveSuccess: Set<string>;
}

const INITIAL_PLUGINS: PluginsState = {
  plugins: [],
  pluginFilter: "all",
  pluginStatusFilter: "all",
  pluginSearch: "",
  pluginSettingsOpen: new Set(),
  pluginAdvancedOpen: new Set(),
  pluginSaving: new Set(),
  pluginSaveSuccess: new Set(),
};

export function usePluginsState() {
  return useLeafState(INITIAL_PLUGINS);
}

// ── Skills ─────────────────────────────────────────────────────────────

export interface SkillsState {
  skills: SkillInfo[];
  skillsSubTab: "my" | "browse";
  skillCreateFormOpen: boolean;
  skillCreateName: string;
  skillCreateDescription: string;
  skillCreating: boolean;
  skillReviewReport: SkillScanReportSummary | null;
  skillReviewId: string;
  skillReviewLoading: boolean;
  skillToggleAction: string;
  skillsMarketplaceQuery: string;
  skillsMarketplaceResults: SkillMarketplaceResult[];
  skillsMarketplaceError: string;
  skillsMarketplaceLoading: boolean;
  skillsMarketplaceAction: string;
  skillsMarketplaceManualGithubUrl: string;
}

const INITIAL_SKILLS: SkillsState = {
  skills: [],
  skillsSubTab: "my",
  skillCreateFormOpen: false,
  skillCreateName: "",
  skillCreateDescription: "",
  skillCreating: false,
  skillReviewReport: null,
  skillReviewId: "",
  skillReviewLoading: false,
  skillToggleAction: "",
  skillsMarketplaceQuery: "",
  skillsMarketplaceResults: [],
  skillsMarketplaceError: "",
  skillsMarketplaceLoading: false,
  skillsMarketplaceAction: "",
  skillsMarketplaceManualGithubUrl: "",
};

export function useSkillsState() {
  return useLeafState(INITIAL_SKILLS);
}

// ── Triggers ───────────────────────────────────────────────────────────

export interface TriggersState {
  triggers: TriggerSummary[];
  triggersLoading: boolean;
  triggersSaving: boolean;
  triggerRunsById: Record<string, TriggerRunRecord[]>;
  triggerHealth: TriggerHealthSnapshot | null;
  triggerError: string | null;
}

const INITIAL_TRIGGERS: TriggersState = {
  triggers: [],
  triggersLoading: false,
  triggersSaving: false,
  triggerRunsById: {},
  triggerHealth: null,
  triggerError: null,
};

export function useTriggersState() {
  return useLeafState(INITIAL_TRIGGERS);
}

// ── Logs ───────────────────────────────────────────────────────────────

export interface LogsState {
  logs: LogEntry[];
  logSources: string[];
  logTags: string[];
  logTagFilter: string;
  logLevelFilter: string;
  logSourceFilter: string;
}

const INITIAL_LOGS: LogsState = {
  logs: [],
  logSources: [],
  logTags: [],
  logTagFilter: "",
  logLevelFilter: "",
  logSourceFilter: "",
};

export function useLogsState() {
  return useLeafState(INITIAL_LOGS);
}

// ── Character ──────────────────────────────────────────────────────────

export interface CharacterState {
  characterData: CharacterData | null;
  characterLoading: boolean;
  characterSaving: boolean;
  characterSaveSuccess: string | null;
  characterSaveError: string | null;
  characterDraft: CharacterData;
  customVrmUrl: string;
  customBackgroundUrl: string;
}

const INITIAL_CHARACTER: CharacterState = {
  characterData: null,
  characterLoading: false,
  characterSaving: false,
  characterSaveSuccess: null,
  characterSaveError: null,
  characterDraft: {},
  customVrmUrl: "",
  customBackgroundUrl: "",
};

export function useCharacterState() {
  return useLeafState(INITIAL_CHARACTER);
}

// ── Cloud ──────────────────────────────────────────────────────────────

export interface CloudState {
  elizaCloudEnabled: boolean;
  elizaCloudConnected: boolean;
  elizaCloudCredits: number | null;
  elizaCloudCreditsLow: boolean;
  elizaCloudCreditsCritical: boolean;
  elizaCloudTopUpUrl: string;
  elizaCloudUserId: string | null;
  cloudDashboardView: "billing" | "agents";
  elizaCloudLoginBusy: boolean;
  elizaCloudLoginError: string | null;
  elizaCloudDisconnecting: boolean;
}

const INITIAL_CLOUD: CloudState = {
  elizaCloudEnabled: false,
  elizaCloudConnected: false,
  elizaCloudCredits: null,
  elizaCloudCreditsLow: false,
  elizaCloudCreditsCritical: false,
  elizaCloudTopUpUrl: "/cloud/billing",
  elizaCloudUserId: null,
  cloudDashboardView: "billing",
  elizaCloudLoginBusy: false,
  elizaCloudLoginError: null,
  elizaCloudDisconnecting: false,
};

export function useCloudState() {
  const hook = useLeafState(INITIAL_CLOUD);
  const elizaCloudLoginBusyRef = useRef(false);
  const elizaCloudPollInterval = useRef<number | null>(null);
  const elizaCloudLoginPollTimer = useRef<number | null>(null);
  const handleCloudLoginRef = useRef<() => Promise<void>>(async () => {});
  return {
    ...hook,
    elizaCloudLoginBusyRef,
    elizaCloudPollInterval,
    elizaCloudLoginPollTimer,
    handleCloudLoginRef,
  };
}

// ── Store / Catalog ────────────────────────────────────────────────────

export interface StoreState {
  storePlugins: RegistryPlugin[];
  storeSearch: string;
  storeFilter: "all" | "installed" | "ai-provider" | "connector" | "feature";
  storeLoading: boolean;
  storeInstalling: Set<string>;
  storeUninstalling: Set<string>;
  storeError: string | null;
  storeDetailPlugin: RegistryPlugin | null;
  storeSubTab: "plugins" | "skills";
  catalogSkills: CatalogSkill[];
  catalogTotal: number;
  catalogPage: number;
  catalogTotalPages: number;
  catalogSort: "downloads" | "stars" | "updated" | "name";
  catalogSearch: string;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogDetailSkill: CatalogSkill | null;
  catalogInstalling: Set<string>;
  catalogUninstalling: Set<string>;
}

const INITIAL_STORE: StoreState = {
  storePlugins: [],
  storeSearch: "",
  storeFilter: "all",
  storeLoading: false,
  storeInstalling: new Set(),
  storeUninstalling: new Set(),
  storeError: null,
  storeDetailPlugin: null,
  storeSubTab: "plugins",
  catalogSkills: [],
  catalogTotal: 0,
  catalogPage: 1,
  catalogTotalPages: 1,
  catalogSort: "downloads",
  catalogSearch: "",
  catalogLoading: false,
  catalogError: null,
  catalogDetailSkill: null,
  catalogInstalling: new Set(),
  catalogUninstalling: new Set(),
};

export function useStoreState() {
  return useLeafState(INITIAL_STORE);
}

// ── Updates / Extension ────────────────────────────────────────────────

export interface UpdatesState {
  updateStatus: UpdateStatus | null;
  updateLoading: boolean;
  updateChannelSaving: boolean;
  extensionStatus: ExtensionStatus | null;
  extensionChecking: boolean;
}

const INITIAL_UPDATES: UpdatesState = {
  updateStatus: null,
  updateLoading: false,
  updateChannelSaving: false,
  extensionStatus: null,
  extensionChecking: false,
};

export function useUpdatesState() {
  const hook = useLeafState(INITIAL_UPDATES);
  const updateChannelSavingRef = useRef(false);
  return { ...hook, updateChannelSavingRef };
}

// ── MCP ────────────────────────────────────────────────────────────────

export interface McpState {
  mcpConfiguredServers: Record<string, McpServerConfig>;
  mcpServerStatuses: McpServerStatus[];
  mcpMarketplaceQuery: string;
  mcpMarketplaceResults: McpMarketplaceResult[];
  mcpMarketplaceLoading: boolean;
  mcpAction: string;
  mcpAddingServer: McpRegistryServerDetail | null;
  mcpAddingResult: McpMarketplaceResult | null;
  mcpEnvInputs: Record<string, string>;
  mcpHeaderInputs: Record<string, string>;
}

const INITIAL_MCP: McpState = {
  mcpConfiguredServers: {},
  mcpServerStatuses: [],
  mcpMarketplaceQuery: "",
  mcpMarketplaceResults: [],
  mcpMarketplaceLoading: false,
  mcpAction: "",
  mcpAddingServer: null,
  mcpAddingResult: null,
  mcpEnvInputs: {},
  mcpHeaderInputs: {},
};

export function useMcpState() {
  return useLeafState(INITIAL_MCP);
}

// ── Game ───────────────────────────────────────────────────────────────

export interface GameState {
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: GamePostMessageAuthPayload | null;
  gameOverlayEnabled: boolean;
}

const INITIAL_GAME: GameState = {
  activeGameApp: "",
  activeGameDisplayName: "",
  activeGameViewerUrl: "",
  activeGameSandbox: "allow-scripts allow-same-origin allow-popups",
  activeGamePostMessageAuth: false,
  activeGamePostMessagePayload: null,
  gameOverlayEnabled: false,
};

export function useGameState() {
  return useLeafState(INITIAL_GAME);
}

// ── Agent Export/Import ────────────────────────────────────────────────

export interface TransferState {
  exportBusy: boolean;
  exportPassword: string;
  exportIncludeLogs: boolean;
  exportError: string | null;
  exportSuccess: string | null;
  importBusy: boolean;
  importPassword: string;
  importFile: File | null;
  importError: string | null;
  importSuccess: string | null;
}

const INITIAL_TRANSFER: TransferState = {
  exportBusy: false,
  exportPassword: "",
  exportIncludeLogs: false,
  exportError: null,
  exportSuccess: null,
  importBusy: false,
  importPassword: "",
  importFile: null,
  importError: null,
  importSuccess: null,
};

export function useTransferState() {
  return useLeafState(INITIAL_TRANSFER);
}

// ── Workbench ──────────────────────────────────────────────────────────

export interface WorkbenchState {
  workbenchLoading: boolean;
  workbench: WorkbenchOverview | null;
  workbenchTasksAvailable: boolean;
  workbenchTriggersAvailable: boolean;
  workbenchTodosAvailable: boolean;
}

const INITIAL_WORKBENCH: WorkbenchState = {
  workbenchLoading: false,
  workbench: null,
  workbenchTasksAvailable: false,
  workbenchTriggersAvailable: false,
  workbenchTodosAvailable: false,
};

export function useWorkbenchState() {
  return useLeafState(INITIAL_WORKBENCH);
}

// ── Share Ingest ───────────────────────────────────────────────────────

export interface ShareIngestState {
  droppedFiles: string[];
  shareIngestNotice: string;
}

const INITIAL_SHARE_INGEST: ShareIngestState = {
  droppedFiles: [],
  shareIngestNotice: "",
};

export function useShareIngestState() {
  return useLeafState(INITIAL_SHARE_INGEST);
}
