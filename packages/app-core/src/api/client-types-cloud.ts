// ---------------------------------------------------------------------------
// Cloud types — Cloud*, App*, Hyperscape*, Trajectory*, Registry*, Whitelist*,
// Verification*, Wallet display types, CodingAgent*, Pty*
// ---------------------------------------------------------------------------

import type { TrajectoryExportFormat } from "./client-types-core";

// Cloud
export interface CloudStatus {
  connected: boolean;
  enabled?: boolean;
  cloudVoiceProxyAvailable?: boolean;
  hasApiKey?: boolean;
  userId?: string;
  organizationId?: string;
  topUpUrl?: string;
  reason?: string;
}

export interface CloudCredits {
  connected: boolean;
  balance: number | null;
  /** True when the cloud API rejected the stored API key (same as chat 401). */
  authRejected?: boolean;
  error?: string;
  low?: boolean;
  critical?: boolean;
  topUpUrl?: string;
}

export interface CloudBillingPaymentMethod {
  id: string;
  type: string;
  label?: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault?: boolean;
  walletAddress?: string;
  network?: string;
}

export interface CloudBillingHistoryItem {
  id: string;
  kind?: string;
  provider?: string;
  status: string;
  amount: number;
  currency: string;
  description?: string;
  receiptUrl?: string;
  createdAt: string;
}

export interface CloudBillingSummary {
  balance: number | null;
  currency?: string;
  low?: boolean;
  critical?: boolean;
  topUpUrl?: string;
  embeddedCheckoutEnabled?: boolean;
  hostedCheckoutEnabled?: boolean;
  cryptoEnabled?: boolean;
  paymentMethods?: CloudBillingPaymentMethod[];
  history?: CloudBillingHistoryItem[];
  [key: string]: unknown;
}

export interface CloudBillingSettings {
  success?: boolean;
  message?: string;
  error?: string;
  settings?: {
    autoTopUp?: {
      enabled?: boolean;
      amount?: number | null;
      threshold?: number | null;
      hasPaymentMethod?: boolean;
    };
    limits?: {
      minAmount?: number;
      maxAmount?: number;
      minThreshold?: number;
      maxThreshold?: number;
    };
  };
  [key: string]: unknown;
}

export interface CloudBillingSettingsUpdateRequest {
  autoTopUp?: {
    enabled?: boolean;
    amount?: number;
    threshold?: number;
  };
}

export interface CloudBillingCheckoutRequest {
  amountUsd: number;
  mode?: "embedded" | "hosted";
}

export interface CloudBillingCheckoutResponse {
  success?: boolean;
  provider?: string;
  mode?: "embedded" | "hosted";
  checkoutUrl?: string;
  url?: string;
  publishableKey?: string;
  clientSecret?: string;
  sessionId?: string;
  message?: string;
  [key: string]: unknown;
}

export interface CloudBillingCryptoQuoteRequest {
  amountUsd: number;
  currency?: string;
  network?: string;
  walletAddress?: string;
}

export interface CloudBillingCryptoQuoteResponse {
  success?: boolean;
  provider?: string;
  invoiceId?: string;
  network?: string;
  currency?: string;
  amount?: string;
  amountUsd?: number;
  payToAddress?: string;
  tokenAddress?: string;
  paymentLinkUrl?: string;
  expiresAt?: string;
  memo?: string;
  [key: string]: unknown;
}

export interface CloudLoginResponse {
  ok: boolean;
  sessionId: string;
  browserUrl: string;
  error?: string;
}

export interface CloudLoginPollResponse {
  status: "pending" | "authenticated" | "expired" | "error";
  keyPrefix?: string;
  error?: string;
}

// Cloud Compat (Eliza Cloud v2 thin-client types)
export interface CloudCompatAgent {
  agent_id: string;
  agent_name: string;
  node_id: string | null;
  container_id: string | null;
  headscale_ip: string | null;
  bridge_url: string | null;
  web_ui_url: string | null;
  status: string;
  agent_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  containerUrl: string;
  webUiUrl: string | null;
  database_status: string;
  error_message: string | null;
  last_heartbeat_at: string | null;
}

export interface CloudCompatAgentStatus {
  status: string;
  lastHeartbeat: string | null;
  bridgeUrl: string | null;
  webUiUrl: string | null;
  currentNode: string | null;
  suspendedReason: string | null;
  databaseStatus: string;
}

export interface CloudCompatManagedDiscordStatus {
  applicationId: string | null;
  configured: boolean;
  connected: boolean;
  developerPortalUrl: string;
  guildId: string | null;
  guildName: string | null;
  adminDiscordUserId: string | null;
  adminDiscordUsername: string | null;
  adminDiscordDisplayName: string | null;
  adminElizaUserId: string | null;
  botNickname: string | null;
  connectedAt: string | null;
  restarted?: boolean;
}

export interface CloudCompatJob {
  jobId: string;
  type: string;
  status: "queued" | "processing" | "completed" | "failed" | "retrying";
  data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  id: string;
  name: string;
  state: string;
  created_on: string;
  completed_on: string | null;
}

export interface CloudCompatLaunchResult {
  agentId: string;
  agentName: string;
  appUrl: string;
  launchSessionId: string | null;
  issuedAt: string;
  connection: {
    apiBase: string;
    token: string;
  };
}

// App types
export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  sessionToken?: string;
  agentId?: string;
}

export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  authMessage?: AppViewerAuthMessage;
}

export interface AppUiExtensionConfig {
  detailPanelId: string;
}

export interface RegistryAppInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  stars: number;
  repository: string;
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  uiExtension?: AppUiExtensionConfig;
  viewer?: AppViewerConfig;
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  version: string;
  installPath: string;
  installedAt: string;
  isRunning: boolean;
}

export interface AppLaunchResult {
  pluginInstalled: boolean;
  needsRestart: boolean;
  displayName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
}

export interface AppStopResult {
  success: boolean;
  appName: string;
  stoppedAt: string;
  pluginUninstalled: boolean;
  needsRestart: boolean;
  stopScope: "plugin-uninstalled" | "viewer-session" | "no-op";
  message: string;
}

// Hyperscape
export type HyperscapeScriptedRole =
  | "combat"
  | "woodcutting"
  | "fishing"
  | "mining"
  | "balanced";

export type HyperscapeEmbeddedAgentControlAction =
  | "start"
  | "stop"
  | "pause"
  | "resume";

export type HyperscapeJsonValue =
  | string
  | number
  | boolean
  | null
  | HyperscapeJsonValue[]
  | { [key: string]: HyperscapeJsonValue };

export type HyperscapePosition =
  | [number, number, number]
  | {
      x: number;
      y: number;
      z: number;
    };

export interface HyperscapeEmbeddedAgent {
  agentId: string;
  characterId: string;
  accountId: string;
  name: string;
  scriptedRole: HyperscapeScriptedRole | null;
  state: string;
  entityId: string | null;
  position: HyperscapePosition | null;
  health: number | null;
  maxHealth: number | null;
  startedAt: number | null;
  lastActivity: number | null;
  error: string | null;
}

export interface HyperscapeEmbeddedAgentsResponse {
  success: boolean;
  agents: HyperscapeEmbeddedAgent[];
  count: number;
  error?: string;
}

export interface HyperscapeActionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface HyperscapeEmbeddedAgentMutationResponse
  extends HyperscapeActionResponse {
  agent?: HyperscapeEmbeddedAgent | null;
}

export interface HyperscapeAvailableGoal {
  id: string;
  type: string;
  description: string;
  priority: number;
}

export interface HyperscapeGoalState {
  type?: string;
  description?: string;
  progress?: number;
  target?: number;
  progressPercent?: number;
  elapsedMs?: number;
  startedAt?: number;
  locked?: boolean;
  lockedBy?: string;
}

export interface HyperscapeAgentGoalResponse {
  success: boolean;
  goal: HyperscapeGoalState | null;
  availableGoals?: HyperscapeAvailableGoal[];
  goalsPaused?: boolean;
  message?: string;
  error?: string;
}

export interface HyperscapeQuickCommand {
  id: string;
  label: string;
  command: string;
  icon: string;
  available: boolean;
  reason?: string;
}

export interface HyperscapeNearbyLocation {
  id: string;
  name: string;
  type: string;
  distance: number;
}

export interface HyperscapeInventoryItem {
  id: string;
  name: string;
  slot: number;
  quantity: number;
  canEquip: boolean;
  canUse: boolean;
  canDrop: boolean;
}

export interface HyperscapeQuickActionsResponse {
  success: boolean;
  nearbyLocations: HyperscapeNearbyLocation[];
  availableGoals: HyperscapeAvailableGoal[];
  quickCommands: HyperscapeQuickCommand[];
  inventory: HyperscapeInventoryItem[];
  playerPosition: [number, number, number] | null;
  message?: string;
  error?: string;
}

// Trajectories
export interface TrajectoryRecord {
  id: string;
  agentId: string;
  roomId: string | null;
  entityId: string | null;
  conversationId: string | null;
  source: string;
  status: "active" | "completed" | "error";
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TrajectoryLlmCall {
  id: string;
  trajectoryId: string;
  stepId: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
  actionType: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  timestamp: number;
  createdAt: string;
}

export interface TrajectoryProviderAccess {
  id: string;
  trajectoryId: string;
  stepId: string;
  providerName: string;
  purpose: string;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  timestamp: number;
  createdAt: string;
}

export interface TrajectoryListOptions {
  limit?: number;
  offset?: number;
  source?: string;
  status?: "active" | "completed" | "error";
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface TrajectoryListResult {
  trajectories: TrajectoryRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface TrajectoryDetailResult {
  trajectory: TrajectoryRecord;
  llmCalls: TrajectoryLlmCall[];
  providerAccesses: TrajectoryProviderAccess[];
}

export interface TrajectoryStats {
  totalTrajectories: number;
  totalLlmCalls: number;
  totalProviderAccesses: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  averageDurationMs: number;
  bySource: Record<string, number>;
  byModel: Record<string, number>;
}

export interface TrajectoryConfig {
  enabled: boolean;
}

export interface TrajectoryExportOptions {
  format: TrajectoryExportFormat;
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
}

// ERC-8004 Registry & Drop types
export interface RegistryStatus {
  registered: boolean;
  tokenId: number;
  agentName: string;
  agentEndpoint: string;
  capabilitiesHash: string;
  isActive: boolean;
  tokenURI: string;
  walletAddress: string;
  totalAgents: number;
  configured: boolean;
}

export interface RegistrationResult {
  tokenId: number;
  txHash: string;
}

export interface RegistryConfig {
  configured: boolean;
  chainId: number;
  registryAddress: string | null;
  collectionAddress: string | null;
  explorerUrl: string;
}

export interface WhitelistStatus {
  eligible: boolean;
  twitterVerified: boolean;
  ogCode: string | null;
  walletAddress: string;
}

export interface VerificationMessageResponse {
  message: string;
  walletAddress: string;
}

// Coding Agent Sessions
export interface CodingAgentSession {
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
  status:
    | "active"
    | "blocked"
    | "completed"
    | "stopped"
    | "error"
    | "tool_running";
  decisionCount: number;
  autoResolvedCount: number;
  /** Description of the active tool when status is "tool_running". */
  toolDescription?: string;
  /** Latest activity text for the agent activity box. */
  lastActivity?: string;
}

export interface CodingAgentScratchWorkspace {
  sessionId: string;
  label: string;
  path: string;
  status: "pending_decision" | "kept" | "promoted";
  createdAt: number;
  terminalAt: number;
  terminalEvent: "stopped" | "task_complete" | "error";
  expiresAt?: number;
}

export interface AgentPreflightResult {
  adapter?: string;
  installed?: boolean;
  installCommand?: string;
  docsUrl?: string;
}

export interface CodingAgentStatus {
  supervisionLevel: string;
  taskCount: number;
  tasks: CodingAgentSession[];
  pendingConfirmations: number;
}

/** Raw PTY session shape returned by /api/coding-agents. */
export interface RawPtySession {
  id: string;
  name?: string;
  agentType?: string;
  workdir?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Maps raw PTY sessions from /api/coding-agents into CodingAgentSession[].
 * Extracted as a pure function so it can be unit-tested without instantiating
 * the full MiladyClient.
 */
export function mapPtySessionsToCodingAgentSessions(
  ptySessions: RawPtySession[],
): CodingAgentSession[] {
  return ptySessions.map((s) => ({
    sessionId: s.id,
    agentType: s.agentType ?? "claude",
    label: (s.metadata?.label as string) ?? s.name ?? s.agentType ?? "Agent",
    originalTask: "",
    workdir: s.workdir ?? "",
    status:
      s.status === "ready" || s.status === "busy"
        ? ("active" as const)
        : s.status === "error"
          ? ("error" as const)
          : s.status === "stopped" ||
              s.status === "done" ||
              s.status === "completed" ||
              s.status === "exited"
            ? ("stopped" as const)
            : ("active" as const),
    decisionCount: 0,
    autoResolvedCount: 0,
  }));
}
