/**
 * API client for the Milaidy backend.
 *
 * Thin fetch wrapper + WebSocket for real-time chat/events.
 * Replaces the gateway WebSocket protocol entirely.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Database types
export type DatabaseProviderType = "pglite" | "postgres";

export interface DatabaseStatus {
  provider: DatabaseProviderType;
  connected: boolean;
  serverVersion: string | null;
  tableCount: number;
  pgliteDataDir: string | null;
  postgresHost: string | null;
}

export interface DatabaseConfigResponse {
  config: {
    provider?: DatabaseProviderType;
    pglite?: { dataDir?: string };
    postgres?: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    };
  };
  activeProvider: DatabaseProviderType;
  needsRestart: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  serverVersion: string | null;
  error: string | null;
  durationMs: number;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface TableRowsResponse {
  table: string;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  offset: number;
  limit: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export type AgentState = "not_started" | "running" | "paused" | "stopped" | "restarting" | "error";

export interface AgentStatus {
  state: AgentState;
  agentName: string;
  model: string | undefined;
  uptime: number | undefined;
  startedAt: number | undefined;
}

export interface MessageExample {
  user: string;
  content: { text: string };
}

export interface StylePreset {
  catchphrase: string;
  hint: string;
  bio: string[];
  system: string;
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives: string[];
  topics: string[];
  messageExamples: MessageExample[][];
}

export interface ProviderOption {
  id: string;
  name: string;
  envKey: string | null;
  pluginName: string;
  keyPrefix: string | null;
  description: string;
}

export interface CloudProviderOption {
  id: string;
  name: string;
  description: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export interface RpcProviderOption {
  id: string;
  name: string;
  description: string;
  envKey: string | null;
  requiresKey: boolean;
}

export interface InventoryProviderOption {
  id: string;
  name: string;
  description: string;
  rpcProviders: RpcProviderOption[];
}

export interface OnboardingOptions {
  names: string[];
  styles: StylePreset[];
  providers: ProviderOption[];
  cloudProviders: CloudProviderOption[];
  models: {
    small: ModelOption[];
    large: ModelOption[];
  };
  inventoryProviders: InventoryProviderOption[];
  sharedStyleRules: string;
}

export interface OnboardingData {
  name: string;
  theme: "light" | "dark";
  runMode: "local" | "cloud";
  bio: string[];
  systemPrompt: string;
  style?: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives?: string[];
  topics?: string[];
  messageExamples?: MessageExample[][];
  // Cloud-specific
  cloudProvider?: string;
  smallModel?: string;
  largeModel?: string;
  // Local-specific
  provider?: string;
  providerApiKey?: string;
  telegramBotToken?: string;
  discordBotToken?: string;
  skillsmpApiKey?: string;
}

export interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  options?: string[];
  currentValue: string | null;
  isSet: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "feature";
  source: "bundled" | "store";
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  isCore?: boolean; // True if plugin is in CORE_PLUGINS (essential for app to run)
  isActive?: boolean; // True if plugin is currently loaded in runtime
}

export interface RegistryPluginInfo {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: { package: string; v0Version: string | null; v1Version: string | null; v2Version: string | null };
  git: { v0Branch: string | null; v1Branch: string | null; v2Branch: string | null };
  supports: { v0: boolean; v1: boolean; v2: boolean };
  insights: {
    trustScore: number;
    trustLevel: "low" | "guarded" | "medium" | "high";
    maintenance: {
      modifiedAt: string | null;
      daysSinceUpdate: number | null;
      status: "fresh" | "recent" | "stale" | "unknown";
      label: string;
    };
    compatibility: {
      confidence: number;
      level: "low" | "medium" | "high";
      label: string;
    };
    restartImpact: {
      install: "restart-required" | "unknown";
      uninstall: "restart-required" | "unknown";
      label: string;
    };
    badges: string[];
  };
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  score: number;
  tags: string[];
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  repository: string;
}

export interface InstalledRegistryPlugin {
  name: string;
  version: string;
  installPath: string;
  installedAt: string;
}

export interface WorkbenchGoal {
  id: string;
  name: string;
  description: string | null;
  ownerType: "agent" | "entity";
  ownerId: string;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface WorkbenchTodo {
  id: string;
  name: string;
  description: string | null;
  type: "daily" | "one-off" | "aspirational";
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface WorkbenchOverview {
  goals: WorkbenchGoal[];
  todos: WorkbenchTodo[];
  summary: {
    goalCount: number;
    openGoals: number;
    completedGoals: number;
    todoCount: number;
    openTodos: number;
    completedTodos: number;
    dueSoonTodos: number;
    overdueTodos: number;
  };
  autonomy: {
    enabled: boolean;
    loopRunning: boolean;
  };
}

export interface WorkbenchGoalCreate {
  name: string;
  description?: string;
  ownerType?: "agent" | "entity";
  ownerId?: string;
  priority?: number | null;
  tags?: string[];
}

export interface WorkbenchGoalUpdate {
  name?: string;
  description?: string;
  isCompleted?: boolean;
  priority?: number | null;
  tags?: string[];
}

export interface WorkbenchTodoCreate {
  name: string;
  description?: string;
  type?: "daily" | "one-off" | "aspirational";
  priority?: number | null;
  isUrgent?: boolean;
  dueDate?: string | null;
  tags?: string[];
}

export interface WorkbenchTodoUpdate {
  name?: string;
  description?: string;
  priority?: number | null;
  isUrgent?: boolean;
  isCompleted?: boolean;
  dueDate?: string | null;
}

export interface ShareIngestFile {
  name: string;
  path?: string;
  mimeType?: string | null;
  size?: number | null;
}

export interface ShareIngestPayload {
  source?: string;
  title?: string;
  text?: string;
  url?: string;
  files?: ShareIngestFile[];
}

export interface ShareIngestItem {
  id: string;
  source: string;
  title: string | null;
  text: string | null;
  url: string | null;
  files: ShareIngestFile[];
  createdAt: number;
  suggestedPrompt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillMarketplaceResult {
  id: string;
  name: string;
  description: string;
  repository: string;
  githubUrl: string;
  path: string | null;
  tags: string[];
  score: number | null;
  source: "skillsmp";
}

export interface McpMarketplaceResult {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  connectionType: "remote" | "stdio";
  connectionUrl?: string;
  npmPackage?: string;
  dockerImage?: string;
  repositoryUrl?: string;
  websiteUrl?: string;
  iconUrl?: string;
  publishedAt?: string;
  isLatest: boolean;
}

export interface McpServerConfig {
  type: "stdio" | "http" | "streamable-http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  cwd?: string;
  timeoutInMillis?: number;
}

export interface McpRegistryServerDetail {
  name: string;
  title?: string;
  description: string;
  version: string;
  remotes?: Array<{
    type: string;
    url: string;
    headers?: Array<{
      name: string;
      description?: string;
      isRequired?: boolean;
      isSecret?: boolean;
    }>;
  }>;
  packages?: Array<{
    registryType: "npm" | "oci";
    identifier: string;
    environmentVariables?: Array<{
      name: string;
      description?: string;
      isSecret?: boolean;
      isRequired?: boolean;
      default?: string;
    }>;
    packageArguments?: Array<{
      name: string;
      description?: string;
      default?: string;
      isRequired?: boolean;
    }>;
  }>;
}

export interface McpServerStatus {
  name: string;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
  toolCount: number;
  resourceCount: number;
}

export interface InstalledMarketplaceSkill {
  id: string;
  name: string;
  description: string;
  repository: string;
  githubUrl: string;
  path: string;
  installPath: string;
  installedAt: string;
  source: "skillsmp" | "manual";
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
}

export interface ExtensionStatus {
  relayReachable: boolean;
  relayPort: number;
  extensionPath: string | null;
}

// Registry / Plugin Store types

export interface RegistryPlugin {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  git: {
    v0Branch: string | null;
    v1Branch: string | null;
    v2Branch: string | null;
  };
  supports: { v0: boolean; v1: boolean; v2: boolean };
  installed: boolean;
  installedVersion: string | null;
  loaded: boolean;
  bundled: boolean;
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  score: number;
  tags: string[];
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  repository: string;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  installPath: string;
  installedAt: string;
}

export interface PluginInstallResult {
  ok: boolean;
  plugin?: { name: string; version: string; installPath: string };
  requiresRestart?: boolean;
  message?: string;
  error?: string;
}

// Wallet types

export interface WalletAddresses { evmAddress: string | null; solanaAddress: string | null }
export interface EvmTokenBalance { symbol: string; name: string; contractAddress: string; balance: string; decimals: number; valueUsd: string; logoUrl: string }
export interface EvmChainBalance { chain: string; chainId: number; nativeBalance: string; nativeSymbol: string; nativeValueUsd: string; tokens: EvmTokenBalance[]; error: string | null }
export interface SolanaTokenBalance { symbol: string; name: string; mint: string; balance: string; decimals: number; valueUsd: string; logoUrl: string }
export interface WalletBalancesResponse {
  evm: { address: string; chains: EvmChainBalance[] } | null;
  solana: { address: string; solBalance: string; solValueUsd: string; tokens: SolanaTokenBalance[] } | null;
}
export interface EvmNft { contractAddress: string; tokenId: string; name: string; description: string; imageUrl: string; collectionName: string; tokenType: string }
export interface SolanaNft { mint: string; name: string; description: string; imageUrl: string; collectionName: string }
export interface WalletNftsResponse { evm: Array<{ chain: string; nfts: EvmNft[] }>; solana: { nfts: SolanaNft[] } | null }
export interface WalletConfigStatus { alchemyKeySet: boolean; heliusKeySet: boolean; birdeyeKeySet: boolean; evmChains: string[]; evmAddress: string | null; solanaAddress: string | null }
export interface WalletExportResult { evm: { privateKey: string; address: string | null } | null; solana: { privateKey: string; address: string | null } | null }

// Cloud
export interface CloudStatus { connected: boolean; userId?: string; organizationId?: string; topUpUrl?: string; reason?: string }
export interface CloudCredits { connected: boolean; balance: number | null; low?: boolean; critical?: boolean; topUpUrl?: string }

// WebSocket

export type WsEventHandler = (data: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MilaidyClient {
  private _baseUrl: string;
  private _explicitBase: boolean;
  private _token: string | null;
  private ws: WebSocket | null = null;
  private wsHandlers = new Map<string, Set<WsEventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 500;

  constructor(baseUrl?: string, token?: string) {
    this._explicitBase = baseUrl != null;
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("milaidy_api_token")
        : null;
    this._token = token?.trim() || stored || null;
    // Priority: explicit arg > Capacitor/Electron injected global > same origin (Vite proxy)
    const global = typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).__MILAIDY_API_BASE__
      : undefined;
    this._baseUrl = baseUrl ?? (typeof global === "string" ? global : "");
  }

  /**
   * Resolve the API base URL lazily.
   * In Electron the main process injects window.__MILAIDY_API_BASE__ after the
   * page loads (once the agent runtime starts). Re-checking on every call
   * ensures we pick up the injected value even if it wasn't set at construction.
   */
  private get baseUrl(): string {
    if (!this._baseUrl && !this._explicitBase && typeof window !== "undefined") {
      const injected = (window as unknown as Record<string, unknown>).__MILAIDY_API_BASE__;
      if (typeof injected === "string") {
        this._baseUrl = injected;
      }
    }
    return this._baseUrl;
  }

  private get apiToken(): string | null {
    if (this._token) return this._token;
    if (typeof window === "undefined") return null;
    const injected = (window as Record<string, unknown>).__MILAIDY_API_TOKEN__;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
    return null;
  }

  hasToken(): boolean {
    return Boolean(this.apiToken);
  }

  setToken(token: string | null): void {
    this._token = token?.trim() || null;
    if (typeof window !== "undefined") {
      if (this._token) {
        window.sessionStorage.setItem("milaidy_api_token", this._token);
      } else {
        window.sessionStorage.removeItem("milaidy_api_token");
      }
    }
  }

  /** True when we have a usable HTTP(S) API endpoint. */
  get apiAvailable(): boolean {
    if (this.baseUrl) return true;
    if (typeof window !== "undefined") {
      const proto = window.location.protocol;
      return proto === "http:" || proto === "https:";
    }
    return false;
  }

  // --- REST API ---

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const makeRequest = (token: string | null) => fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    const token = this.apiToken;
    let res = await makeRequest(token);
    if (res.status === 401 && !token) {
      const retryToken = this.apiToken;
      if (retryToken) {
        res = await makeRequest(retryToken);
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>;
      const err = new Error(body.error ?? `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.fetch("/api/status");
  }

  async getOnboardingStatus(): Promise<{ complete: boolean }> {
    return this.fetch("/api/onboarding/status");
  }

  async getAuthStatus(): Promise<{ required: boolean; pairingEnabled: boolean; expiresAt: number | null }> {
    return this.fetch("/api/auth/status");
  }

  async pair(code: string): Promise<{ token: string }> {
    const res = await this.fetch<{ token: string }>("/api/auth/pair", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    return res;
  }

  async getOnboardingOptions(): Promise<OnboardingOptions> {
    return this.fetch("/api/onboarding/options");
  }

  async submitOnboarding(data: OnboardingData): Promise<void> {
    await this.fetch("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async startAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/start", { method: "POST" });
    return res.status;
  }

  async stopAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/stop", { method: "POST" });
    return res.status;
  }

  async pauseAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/pause", { method: "POST" });
    return res.status;
  }

  async resumeAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/resume", { method: "POST" });
    return res.status;
  }

  async restartAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/restart", { method: "POST" });
    return res.status;
  }

  async resetAgent(): Promise<void> {
    await this.fetch("/api/agent/reset", { method: "POST" });
  }

  async getPlugins(): Promise<{ plugins: PluginInfo[] }> {
    return this.fetch("/api/plugins");
  }

  async updatePlugin(id: string, config: Record<string, unknown>): Promise<void> {
    await this.fetch(`/api/plugins/${id}`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async getWorkbenchOverview(): Promise<WorkbenchOverview> {
    return this.fetch("/api/workbench/overview");
  }

  async createWorkbenchGoal(input: WorkbenchGoalCreate): Promise<{ ok: boolean; id: string }> {
    return this.fetch("/api/workbench/goals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateWorkbenchGoal(goalId: string, updates: WorkbenchGoalUpdate): Promise<{ ok: boolean; id: string }> {
    return this.fetch(`/api/workbench/goals/${encodeURIComponent(goalId)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async setWorkbenchGoalCompleted(goalId: string, isCompleted: boolean): Promise<{ ok: boolean }> {
    return this.updateWorkbenchGoal(goalId, { isCompleted });
  }

  async createWorkbenchTodo(input: WorkbenchTodoCreate): Promise<{ ok: boolean; id: string }> {
    return this.fetch("/api/workbench/todos", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateWorkbenchTodo(todoId: string, updates: WorkbenchTodoUpdate): Promise<{ ok: boolean; id: string }> {
    return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async setWorkbenchTodoCompleted(todoId: string, isCompleted: boolean): Promise<{ ok: boolean }> {
    return this.updateWorkbenchTodo(todoId, { isCompleted });
  }

  async ingestShare(payload: ShareIngestPayload): Promise<{ ok: boolean; item: ShareIngestItem }> {
    return this.fetch("/api/ingest/share", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async consumeShareIngest(): Promise<{ items: ShareIngestItem[] }> {
    return this.fetch("/api/ingest/share?consume=1");
  }

  async getSkills(): Promise<{ skills: SkillInfo[] }> {
    return this.fetch("/api/skills");
  }

  async refreshSkills(): Promise<{ ok: boolean; skills: SkillInfo[] }> {
    return this.fetch("/api/skills/refresh", { method: "POST" });
  }

  async updateSkill(id: string, enabled: boolean): Promise<{ ok: boolean; skill: SkillInfo }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  }

  async searchSkillsMarketplace(query: string, aiSearch = false, limit = 20): Promise<{
    query: string;
    count: number;
    results: SkillMarketplaceResult[];
  }> {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", String(Math.max(1, Math.min(limit, 50))));
    if (aiSearch) params.set("ai", "1");
    return this.fetch(`/api/skills/marketplace/search?${params.toString()}`);
  }

  async getInstalledMarketplaceSkills(): Promise<{ count: number; skills: InstalledMarketplaceSkill[] }> {
    return this.fetch("/api/skills/marketplace/installed");
  }

  async installMarketplaceSkill(input: {
    githubUrl?: string;
    repository?: string;
    path?: string;
    name?: string;
    description?: string;
    source?: "skillsmp" | "manual";
    autoRefresh?: boolean;
  }): Promise<{ ok: boolean; skill: InstalledMarketplaceSkill; refreshedSkills?: SkillInfo[] }> {
    return this.fetch("/api/skills/marketplace/install", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async uninstallMarketplaceSkill(id: string, autoRefresh = true): Promise<{
    ok: boolean;
    skill: InstalledMarketplaceSkill;
    refreshedSkills?: SkillInfo[];
  }> {
    return this.fetch("/api/skills/marketplace/uninstall", {
      method: "POST",
      body: JSON.stringify({ id, autoRefresh }),
    });
  }

  async getSkillsMarketplaceConfig(): Promise<{ keySet: boolean }> {
    return this.fetch("/api/skills/marketplace/config");
  }

  async updateSkillsMarketplaceConfig(apiKey: string): Promise<{ ok: boolean; keySet: boolean }> {
    return this.fetch("/api/skills/marketplace/config", {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MCP Marketplace and Config
  // ─────────────────────────────────────────────────────────────────────────

  async searchMcpMarketplace(query: string, limit = 30): Promise<{
    ok: boolean;
    results: McpMarketplaceResult[];
  }> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("limit", String(Math.max(1, Math.min(limit, 50))));
    return this.fetch(`/api/mcp/marketplace/search?${params.toString()}`);
  }

  async getMcpConfig(): Promise<{
    ok: boolean;
    servers: Record<string, McpServerConfig>;
  }> {
    return this.fetch("/api/mcp/config");
  }

  async updateMcpConfig(servers: Record<string, McpServerConfig>): Promise<{ ok: boolean }> {
    return this.fetch("/api/mcp/config", {
      method: "PUT",
      body: JSON.stringify({ servers }),
    });
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<{ ok: boolean; name: string; requiresRestart?: boolean }> {
    return this.fetch("/api/mcp/config/server", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    });
  }

  async removeMcpServer(name: string): Promise<{ ok: boolean; requiresRestart?: boolean }> {
    return this.fetch(`/api/mcp/config/server/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  async getMcpServerDetails(name: string): Promise<{ ok: boolean; server: McpRegistryServerDetail }> {
    return this.fetch(`/api/mcp/marketplace/details/${encodeURIComponent(name)}`);
  }

  async getMcpStatus(): Promise<{ ok: boolean; servers: McpServerStatus[] }> {
    return this.fetch("/api/mcp/status");
  }

  async getLogs(): Promise<{ entries: LogEntry[] }> {
    return this.fetch("/api/logs");
  }

  async getExtensionStatus(): Promise<ExtensionStatus> {
    return this.fetch("/api/extension/status");
  }

  // Registry / Plugin Store

  async getRegistryPlugins(): Promise<{ count: number; plugins: RegistryPlugin[] }> {
    return this.fetch("/api/registry/plugins");
  }

  async searchRegistryPlugins(query: string, limit = 15): Promise<{ query: string; count: number; results: RegistrySearchResult[] }> {
    return this.fetch(`/api/registry/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async getRegistryPluginInfo(name: string): Promise<{ plugin: RegistryPlugin }> {
    return this.fetch(`/api/registry/plugins/${encodeURIComponent(name)}`);
  }

  async getInstalledPlugins(): Promise<{ count: number; plugins: InstalledPlugin[] }> {
    return this.fetch("/api/plugins/installed");
  }

  async installRegistryPlugin(name: string, autoRestart = true): Promise<PluginInstallResult> {
    return this.fetch("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
    });
  }

  async uninstallRegistryPlugin(name: string, autoRestart = true): Promise<{ ok: boolean; pluginName: string; message: string; error?: string }> {
    return this.fetch("/api/plugins/uninstall", {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
    });
  }

  async refreshRegistry(): Promise<{ count: number }> {
    return this.fetch("/api/registry/refresh", { method: "POST" });
  }

  // Agent Export / Import

  /**
   * Export the agent as a password-encrypted .eliza-agent file.
   * Returns the raw Response so the caller can stream the binary body.
   */
  async exportAgent(password: string, includeLogs = false): Promise<Response> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}/api/agent/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ password, includeLogs }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>;
      const err = new Error(body.error ?? `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return res;
  }

  /** Get an estimate of the export size. */
  async getExportEstimate(): Promise<{
    estimatedBytes: number;
    memoriesCount: number;
    entitiesCount: number;
    roomsCount: number;
    worldsCount: number;
    tasksCount: number;
  }> {
    return this.fetch("/api/agent/export/estimate");
  }

  /**
   * Import an agent from a password-encrypted .eliza-agent file.
   * Encodes the password and file into a binary envelope.
   */
  async importAgent(
    password: string,
    fileBuffer: ArrayBuffer,
  ): Promise<{
    success: boolean;
    agentId: string;
    agentName: string;
    counts: Record<string, number>;
  }> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const passwordBytes = new TextEncoder().encode(password);
    const envelope = new Uint8Array(4 + passwordBytes.length + fileBuffer.byteLength);
    const view = new DataView(envelope.buffer);
    view.setUint32(0, passwordBytes.length, false);
    envelope.set(passwordBytes, 4);
    envelope.set(new Uint8Array(fileBuffer), 4 + passwordBytes.length);

    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}/api/agent/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: envelope,
    });

    const data = await res.json() as {
      error?: string;
      success?: boolean;
      agentId?: string;
      agentName?: string;
      counts?: Record<string, number>;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `Import failed (${res.status})`);
    }
    return data as {
      success: boolean;
      agentId: string;
      agentName: string;
      counts: Record<string, number>;
    };
  }

  // Wallet

  async getWalletAddresses(): Promise<WalletAddresses> { return this.fetch("/api/wallet/addresses"); }
  async getWalletBalances(): Promise<WalletBalancesResponse> { return this.fetch("/api/wallet/balances"); }
  async getWalletNfts(): Promise<WalletNftsResponse> { return this.fetch("/api/wallet/nfts"); }
  async getWalletConfig(): Promise<WalletConfigStatus> { return this.fetch("/api/wallet/config"); }
  async updateWalletConfig(config: Record<string, string>): Promise<{ ok: boolean }> { return this.fetch("/api/wallet/config", { method: "PUT", body: JSON.stringify(config) }); }
  async exportWalletKeys(): Promise<WalletExportResult> { return this.fetch("/api/wallet/export", { method: "POST", body: JSON.stringify({ confirm: true }) }); }

  // Cloud
  async getCloudStatus(): Promise<CloudStatus> { return this.fetch("/api/cloud/status"); }
  async getCloudCredits(): Promise<CloudCredits> { return this.fetch("/api/cloud/credits"); }

  // WebSocket

  connectWs(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let host: string;
    if (this.baseUrl) {
      host = new URL(this.baseUrl).host;
    } else {
      // In non-HTTP environments (Electron capacitor-electron://, file://, etc.)
      // window.location.host may be empty or a non-routable placeholder like "-".
      const loc = window.location;
      if (loc.protocol !== "http:" && loc.protocol !== "https:") return;
      host = loc.host;
    }

    if (!host) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.backoffMs = 500;
    };

    this.ws.onmessage = (event) => {
      try {
        if (typeof event.data !== "string") return;
        const data = JSON.parse(event.data) as Record<string, unknown>;
        const type = typeof data.type === "string" ? data.type : undefined;
        if (!type) return;
        const handlers = this.wsHandlers.get(type);
        if (handlers) {
          for (const handler of handlers) {
            handler(data);
          }
        }
        // Also fire "all" handlers
        const allHandlers = this.wsHandlers.get("*");
        if (allHandlers) {
          for (const handler of allHandlers) {
            handler(data);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // close handler will fire
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 1.5, 10000);
  }

  onWsEvent(type: string, handler: WsEventHandler): () => void {
    if (!this.wsHandlers.has(type)) {
      this.wsHandlers.set(type, new Set());
    }
    this.wsHandlers.get(type)!.add(handler);
    return () => {
      this.wsHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * Send a chat message via the REST endpoint (reliable — does not depend on
   * a WebSocket connection).  Returns the agent's response text.
   */
  async sendChatRest(text: string): Promise<{ text: string; agentName: string }> {
    return this.fetch<{ text: string; agentName: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  /** @deprecated Prefer {@link sendChatRest} — WebSocket chat may silently drop messages. */
  sendChat(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "chat", text }));
    }
  }

  // ── Database API ──────────────────────────────────────────────────────

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    return this.fetch("/api/database/status");
  }

  async getDatabaseConfig(): Promise<DatabaseConfigResponse> {
    return this.fetch("/api/database/config");
  }

  async saveDatabaseConfig(config: {
    provider?: DatabaseProviderType;
    pglite?: { dataDir?: string };
    postgres?: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    };
  }): Promise<{ saved: boolean; needsRestart: boolean }> {
    return this.fetch("/api/database/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async testDatabaseConnection(creds: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
  }): Promise<ConnectionTestResult> {
    return this.fetch("/api/database/test", {
      method: "POST",
      body: JSON.stringify(creds),
    });
  }

  async getDatabaseTables(): Promise<{ tables: TableInfo[] }> {
    return this.fetch("/api/database/tables");
  }

  async getDatabaseRows(
    table: string,
    opts?: { offset?: number; limit?: number; sort?: string; order?: "asc" | "desc"; search?: string },
  ): Promise<TableRowsResponse> {
    const params = new URLSearchParams();
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.order) params.set("order", opts.order);
    if (opts?.search) params.set("search", opts.search);
    const qs = params.toString();
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows${qs ? `?${qs}` : ""}`);
  }

  async insertDatabaseRow(
    table: string,
    data: Record<string, unknown>,
  ): Promise<{ inserted: boolean; row: Record<string, unknown> | null }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
  }

  async updateDatabaseRow(
    table: string,
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<{ updated: boolean; row: Record<string, unknown> }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "PUT",
      body: JSON.stringify({ where, data }),
    });
  }

  async deleteDatabaseRow(
    table: string,
    where: Record<string, unknown>,
  ): Promise<{ deleted: boolean; row: Record<string, unknown> }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "DELETE",
      body: JSON.stringify({ where }),
    });
  }

  async executeDatabaseQuery(
    sql: string,
    readOnly = true,
  ): Promise<QueryResult> {
    return this.fetch("/api/database/query", {
      method: "POST",
      body: JSON.stringify({ sql, readOnly }),
    });
  }

  disconnectWs(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton
export const client = new MilaidyClient();
