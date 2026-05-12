import { clearToken } from "./auth";
import type {
  BillingSettingsResponse,
  CreditsSummaryResponse,
} from "./billing-types";
import {
  CLOUD_AGENT_API_BASE_PATH,
  CLOUD_BASE,
  getCloudAgentApiPath,
} from "./runtime-config";

export type {
  StewardApprovalActionResponse,
  StewardPendingApproval,
  StewardPolicyResult,
  StewardStatusResponse,
  StewardTxRecord,
  StewardTxStatus,
} from "@elizaos/app-core/api/client-types-steward";
// ── Wallet types ───────────────────────────────────────────────────────
export type {
  EvmChainBalance,
  EvmTokenBalance,
  SolanaTokenBalance,
  WalletBalancesResponse,
} from "@elizaos/shared/contracts/wallet";

import type {
  StewardApprovalActionResponse,
  StewardPendingApproval,
  StewardStatusResponse,
  StewardTxRecord,
} from "@elizaos/app-core/api/client-types-steward";
import type { WalletBalancesResponse } from "@elizaos/shared/contracts/wallet";

// Wallet addresses response (same shape as WalletAddresses but with Response suffix for API clarity)
export type { WalletAddresses as WalletAddressesResponse } from "@elizaos/shared/contracts/wallet";

import type { WalletAddresses as WalletAddressesResponse } from "@elizaos/shared/contracts/wallet";

// Steward policy types (not in shared — these are UI-specific config shapes)
export type StewardPolicyType =
  | "spending-limit"
  | "approved-addresses"
  | "auto-approve-threshold"
  | "time-window"
  | "rate-limit";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export const AGENT_RUNTIME_STATES = [
  "running",
  "paused",
  "stopped",
  "provisioning",
  "unknown",
] as const;

export type AgentRuntimeState = (typeof AGENT_RUNTIME_STATES)[number];

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentRuntimeState(value: string): value is AgentRuntimeState {
  return AGENT_RUNTIME_STATES.includes(value as AgentRuntimeState);
}

export function normalizeAgentState(status?: string | null): AgentRuntimeState {
  const normalized = status?.toLowerCase().trim() ?? "";
  if (isAgentRuntimeState(normalized)) return normalized;
  if (
    normalized === "running" ||
    normalized === "active" ||
    normalized === "healthy"
  ) {
    return "running";
  }
  if (normalized === "paused" || normalized === "suspended") {
    return "paused";
  }
  if (
    normalized === "stopped" ||
    normalized === "terminated" ||
    normalized === "deleted"
  ) {
    return "stopped";
  }
  if (
    normalized === "provisioning" ||
    normalized === "creating" ||
    normalized === "starting"
  ) {
    return "provisioning";
  }
  return "unknown";
}

export interface CloudAgentBilling {
  plan?: string;
  costPerHour?: number;
  totalCost?: number;
  currency?: string;
}

export type StewardApprovedAddressesMode = "whitelist" | "blacklist";

export interface StewardAllowedHourWindow {
  start: number;
  end: number;
}

export interface StewardPolicyConfig {
  maxPerTx?: string;
  maxPerDay?: string;
  maxPerWeek?: string;
  addresses?: string[];
  mode?: StewardApprovedAddressesMode;
  threshold?: string;
  allowedHours?: StewardAllowedHourWindow[];
  allowedDays?: number[];
  maxTxPerHour?: number;
  maxTxPerDay?: number;
}

export type StewardPolicyConfigKey = keyof StewardPolicyConfig;
export type StewardPolicyConfigValue = Exclude<
  StewardPolicyConfig[StewardPolicyConfigKey],
  undefined
>;

export interface StewardPolicyRule {
  id: string;
  type: StewardPolicyType;
  enabled: boolean;
  config: StewardPolicyConfig;
}

export interface CloudAgentDetail {
  id: string;
  name: string;
  /** Backend returns agentName; mapped to name by listAgents(). */
  agentName?: string;
  status: string;
  model?: string;
  bridgeUrl?: string;
  webUiUrl?: string;
  tokens?: { used: number; limit: number };
  errors?: string[];
  createdAt?: string;
  updatedAt?: string;
  billing?: CloudAgentBilling;
  uptime?: number;
  region?: string;
}

export interface CloudBackup {
  id: string;
  createdAt: string;
  size?: number;
}

export interface CreditBalance {
  balance: number;
  currency?: string;
}

export interface JobStatus {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: JsonValue;
  error?: string;
}

export interface BridgeResponse<T = JsonObject> {
  result?: T;
  error?: JsonValue;
  [key: string]: JsonValue | T | undefined;
}

export interface BridgeStatus {
  state: AgentRuntimeState;
  uptime?: number;
  memories?: number;
}

/**
 * Check if a response indicates an authentication failure.
 *
 * Note: 500 errors with generic messages ("Internal Server Error") are NOT treated
 * as auth failures — only when the backend explicitly returns auth-related text.
 * This prevents missing or unimplemented endpoints from triggering logout.
 */
function isCloudAuthFailure(status: number, message: string): boolean {
  // 401 is always an auth failure
  if (status === 401) return true;

  // 403/500 are only auth failures if they contain specific auth-related text
  // (not generic server errors)
  if (status === 403 || status === 500) {
    // Skip generic error messages that don't indicate auth problems
    if (/^Internal Server Error$/i.test(message.trim())) {
      return false;
    }
    // Check for explicit auth-related messages
    return /Invalid or expired API key|API key is inactive|API key has expired|Invalid or expired token/i.test(
      message,
    );
  }

  return false;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    return JSON.stringify(body);
  } catch {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}

function unwrapListResponse<T>(
  data: unknown,
  primaryKey?: "agents" | "backups" | "containers",
): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!isJsonObject(data)) return [];
  const obj = data;
  if (primaryKey && Array.isArray(obj[primaryKey])) {
    return obj[primaryKey] as T[];
  }
  if (Array.isArray(obj.data)) return obj.data as T[];
  return [];
}

function unwrapDataResponse<T>(data: unknown): T {
  if (isJsonObject(data) && "data" in data) return data.data as T;
  return data as T;
}

export interface CreateCloudAgentInput {
  name: string;
  characterId?: string;
  config?: JsonObject;
  environmentVars?: Record<string, string>;
}

interface CreateCloudAgentRequest {
  agentName: string;
  characterId?: string;
  agentConfig?: JsonObject;
  environmentVars?: Record<string, string>;
}

export interface CreateCloudAgentResponse {
  id: string;
}

interface CreateCloudAgentApiResponse {
  success?: boolean;
  data?: { id: string };
  id?: string;
}

export interface CloudSessionSummary {
  credits?: number;
  requests?: number;
  tokens?: number;
}

export class CloudAgentsNotAvailableError extends Error {
  constructor() {
    super("Cloud agent hosting is not available on this server yet.");
    this.name = "CloudAgentsNotAvailableError";
  }
}

export class CloudClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Expose the API key so authenticated launch token requests can use it. */
  getToken(): string {
    return this.apiKey;
  }

  /**
   * Make an authenticated request to the Cloud API.
   *
   * @param path - API endpoint path
   * @param opts - Fetch options
   * @param clearAuthOnFailure - If true, clear the stored token on auth failure.
   *   Only the primary auth-checking endpoint (listAgents) should set this to true.
   *   Secondary endpoints like credits/billing should fail gracefully without
   *   nuking auth state, since they may not be implemented on the backend yet.
   */
  private async request<T>(
    path: string,
    opts: RequestInit = {},
    clearAuthOnFailure = false,
  ): Promise<T> {
    const headers = new Headers(opts.headers);
    // Send both X-Api-Key and Authorization: Bearer for cross-origin
    // compatibility. The cloud backend accepts either header format.
    headers.set("X-Api-Key", this.apiKey);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (opts.body && typeof opts.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${CLOUD_BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
      const errorMessage = await readErrorMessage(res);
      // Only clear the token if this is a primary auth-checking endpoint
      // AND the response indicates an actual auth failure
      if (clearAuthOnFailure && isCloudAuthFailure(res.status, errorMessage)) {
        clearToken();
      }
      // 404 on cloud agent endpoints means the cloud instance hasn't deployed
      // the agent hosting feature yet — throw a specific error so callers can
      // show a "coming soon" message instead of a generic failure.
      if (res.status === 404 && path.startsWith(CLOUD_AGENT_API_BASE_PATH)) {
        throw new CloudAgentsNotAvailableError();
      }
      throw new Error(
        errorMessage
          ? `Cloud API ${res.status}: ${path}: ${errorMessage}`
          : `Cloud API ${res.status}: ${path}`,
      );
    }
    return res.json();
  }

  // Agent management
  async listAgents(): Promise<CloudAgentDetail[]> {
    // listAgents is the canonical auth-checking endpoint: if this fails with
    // an auth error, the token is definitely invalid and should be cleared.
    const data = await this.request<unknown>(
      getCloudAgentApiPath(),
      {
        method: "GET",
      },
      true, // clearAuthOnFailure: this is the primary auth check
    );
    const raw = unwrapListResponse<CloudAgentDetail>(data, "agents");
    // Backend returns agentName; normalize to name for the rest of the app.
    // The backend does not return an uptime field — derive it client-side from
    // createdAt so the AgentCard can show a meaningful value instead of "—".
    return raw.map((a) => ({
      ...a,
      name: a.agentName || a.name || a.id,
      uptime:
        a.uptime ??
        (a.createdAt
          ? Math.floor((Date.now() - new Date(a.createdAt).getTime()) / 1000)
          : undefined),
    }));
  }

  async getAgent(agentId: string): Promise<CloudAgentDetail> {
    const data = await this.request<unknown>(getCloudAgentApiPath(agentId), {
      method: "GET",
    });
    return unwrapDataResponse<CloudAgentDetail>(data);
  }

  async createAgent(
    config: CreateCloudAgentInput,
  ): Promise<CreateCloudAgentResponse> {
    // Backend expects agentName (not name) and agentConfig (not config)
    const payload: CreateCloudAgentRequest = {
      agentName: config.name,
    };
    if (config.characterId) payload.characterId = config.characterId;
    if (config.config) payload.agentConfig = config.config;
    if (config.environmentVars) {
      payload.environmentVars = config.environmentVars;
    }

    const res = await this.request<CreateCloudAgentApiResponse>(
      getCloudAgentApiPath(),
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
    // Backend wraps response in { success, data: { id, ... } }
    const id = res.data?.id ?? res.id ?? "";
    return { id };
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.request(getCloudAgentApiPath(agentId), {
      method: "DELETE",
    });
  }

  // Lifecycle
  async provisionAgent(agentId: string): Promise<{ jobId?: string }> {
    const res = await this.request<{
      jobId?: string;
      data?: { jobId?: string };
    }>(getCloudAgentApiPath(agentId, "provision"), {
      method: "POST",
    });
    return { jobId: res.jobId ?? res.data?.jobId };
  }

  async suspendAgent(agentId: string): Promise<void> {
    await this.request(getCloudAgentApiPath(agentId, "suspend"), {
      method: "POST",
    });
  }

  async resumeAgent(agentId: string): Promise<{ jobId?: string }> {
    const res = await this.request<{
      jobId?: string;
      data?: { jobId?: string };
    }>(getCloudAgentApiPath(agentId, "resume"), {
      method: "POST",
    });
    return { jobId: res.jobId ?? res.data?.jobId };
  }

  // Snapshots & backups
  async takeSnapshot(agentId: string): Promise<void> {
    await this.request(getCloudAgentApiPath(agentId, "snapshot"), {
      method: "POST",
    });
  }

  async listBackups(agentId: string): Promise<CloudBackup[]> {
    const data = await this.request<unknown>(
      getCloudAgentApiPath(agentId, "backups"),
      { method: "GET" },
    );
    return unwrapListResponse<CloudBackup>(data, "backups");
  }

  async restoreBackup(agentId: string, backupId?: string): Promise<void> {
    await this.request(getCloudAgentApiPath(agentId, "restore"), {
      method: "POST",
      body: JSON.stringify(backupId ? { backupId } : {}),
    });
  }

  // Bridge (JSON-RPC to sandbox)
  async bridge<T = JsonObject>(
    agentId: string,
    method: string,
    params?: object,
  ): Promise<BridgeResponse<T>> {
    return this.request(getCloudAgentApiPath(agentId, "bridge"), {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params: params ?? {},
      }),
    });
  }

  async getAgentBridgeStatus(agentId: string): Promise<BridgeStatus> {
    const res = await this.bridge<BridgeStatus>(agentId, "status.get");
    const payload = res.result ?? res;
    const state = normalizeAgentState(
      typeof payload.state === "string" ? payload.state : undefined,
    );
    return {
      state,
      uptime: typeof payload.uptime === "number" ? payload.uptime : undefined,
      memories:
        typeof payload.memories === "number" ? payload.memories : undefined,
    };
  }

  // Credits & billing
  async getCreditsBalance(): Promise<CreditBalance> {
    return this.request("/api/credits/balance", { method: "GET" });
  }

  async getCreditsSummary(): Promise<CreditsSummaryResponse> {
    return this.request("/api/v1/credits/summary", { method: "GET" });
  }

  // Jobs (async operation polling)
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const data = await this.request<unknown>(`/api/v1/jobs/${jobId}`, {
      method: "GET",
    });
    return unwrapDataResponse<JobStatus>(data);
  }

  async pollJobUntilDone(
    jobId: string,
    timeoutMs = 120000,
  ): Promise<JobStatus> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await this.getJobStatus(jobId);
      if (job.status === "completed" || job.status === "failed") return job;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Job timed out");
  }

  // Containers (for container-level monitoring)
  async listContainers(): Promise<JsonObject[]> {
    const data = await this.request<unknown>("/api/v1/containers", {
      method: "GET",
    });
    return unwrapListResponse<JsonObject>(data, "containers");
  }

  async getContainerHealth(containerId: string): Promise<JsonObject> {
    return this.request(`/api/v1/containers/${containerId}/health`, {
      method: "GET",
    });
  }

  async getContainerMetrics(
    containerId: string,
  ): Promise<Partial<MetricsData>> {
    return this.request(`/api/v1/containers/${containerId}/metrics`, {
      method: "GET",
    });
  }

  async getContainerLogs(containerId: string): Promise<string> {
    const res = await fetch(
      `${CLOUD_BASE}/api/v1/containers/${containerId}/logs`,
      {
        headers: { "X-Api-Key": this.apiKey },
      },
    );
    if (!res.ok) throw new Error(`Logs ${res.status}`);
    return res.text();
  }

  // Billing settings
  async getBillingSettings(): Promise<BillingSettingsResponse> {
    return this.request("/api/v1/billing/settings", { method: "GET" });
  }

  // Billing checkout — creates a Stripe checkout session, returns { url, sessionId }
  async createBillingCheckout(amountUsd: number): Promise<{
    checkoutUrl?: string;
    url?: string;
    clientSecret?: string;
    publishableKey?: string;
    sessionId?: string;
  }> {
    // Use the cloud base URL for redirects since the cloud validates redirect origins
    const redirectBase = CLOUD_BASE;
    return this.request("/api/v1/credits/checkout", {
      method: "POST",
      body: JSON.stringify({
        credits: amountUsd,
        success_url: `${redirectBase}/dashboard/billing/success`,
        cancel_url: `${redirectBase}/dashboard/settings?tab=billing&canceled=1`,
      }),
    });
  }

  // Pairing token (for opening Web UI with auth handoff)
  async getPairingToken(agentId: string): Promise<{
    token: string;
    redirectUrl: string;
    expiresIn: number;
  }> {
    const res = await this.request<
      | { token: string; redirectUrl: string; expiresIn: number }
      | { data: { token: string; redirectUrl: string; expiresIn: number } }
    >(getCloudAgentApiPath(agentId, "pairing-token"), { method: "POST" });
    // Backend may wrap in { data: ... } or return flat
    if ("data" in res && res.data?.redirectUrl) return res.data;
    return res as { token: string; redirectUrl: string; expiresIn: number };
  }

  // Session info
  async getCurrentSession(): Promise<{
    credits?: number;
    requests?: number;
    tokens?: number;
  }> {
    return this.request("/api/sessions/current", { method: "GET" });
  }
}

export type ConnectionType = "local" | "remote" | "cloud";

export interface ConnectionInfo {
  url: string;
  type: ConnectionType;
  /** Optional bearer token for agents that require auth (e.g. MILADY_API_TOKEN).
   *  Sent as `Authorization: Bearer {authToken}`.
   *  Note: X-Api-Key is NOT used here because agent CORS only allows "Authorization". */
  authToken?: string;
}

export interface AgentStatus {
  state: AgentRuntimeState;
  uptime?: number;
  memories?: number;
  agentName: string;
  model: string;
}

export interface MetricsData {
  cpu: number;
  memoryMb: number;
  diskMb: number;
  timestamp: string;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  agentName: string;
}

export interface HealthResponse {
  status?: string;
  ready?: boolean;
  uptime: number;
  memoryUsage?: JsonObject;
  agentState?: AgentRuntimeState;
  /** True if this is a synthetic response (agent is auth-gated but alive). */
  _synthetic?: true;
}

interface RequestSignalOptions {
  signal?: AbortSignal;
}

/**
 * Synthetic health response returned when an agent is auth-gated but alive.
 * The `_synthetic` flag signals to callers that no real data was retrieved,
 * so they can skip further probes (like getAgentStatus).
 */
function makeUnauthenticatedHealthResponse(): HealthResponse {
  return {
    status: "ok",
    ready: true,
    uptime: 0,
    agentState: "running",
    _synthetic: true as const,
  };
}

/**
 * Synthetic status returned when an agent is auth-gated but alive.
 */
function makeUnauthenticatedAgentStatus(): AgentStatus {
  return {
    state: "running",
    agentName: "",
    model: "—",
    uptime: 0,
  };
}

export class CloudApiClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(connection: ConnectionInfo) {
    this.baseUrl = connection.url.replace(/\/$/, "");
    this.authToken = connection.authToken;
  }

  private buildHeaders(opts: RequestInit = {}): Headers {
    // Use Authorization for local/remote agents because their browser CORS policy
    // explicitly allows bearer auth, while custom headers like X-Api-Key may be blocked.
    const headers = new Headers(opts.headers);
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }
    return headers;
  }

  private async rawFetch(
    path: string,
    opts: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...opts,
      headers: this.buildHeaders(opts),
    });
  }

  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await this.rawFetch(path, opts);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  }

  async health(options?: RequestSignalOptions): Promise<HealthResponse> {
    const fetchOpts: RequestInit = { method: "GET" };
    if (options?.signal) fetchOpts.signal = options.signal;

    const primary = await this.rawFetch("/api/health", fetchOpts);
    if (primary.ok) {
      return primary.json();
    }

    // If auth is required (401/403) and we don't have a token, the agent is
    // alive but auth-gated. Return a synthetic "running" response immediately.
    // No need to probe additional endpoints — a 401 proves the agent is up.
    if (primary.status === 401 || primary.status === 403) {
      if (!this.authToken) {
        // Agent is alive (returned 401), just auth-protected.
        return makeUnauthenticatedHealthResponse();
      }
      // We have a token but it was rejected — that's a real auth failure.
      throw new Error(`API ${primary.status}: /api/health`);
    }

    if (primary.status !== 404) {
      throw new Error(`API ${primary.status}: /api/health`);
    }

    throw new Error(`API ${primary.status}: /api/health`);
  }

  async getStreamSettings(): Promise<{
    ok: boolean;
    settings: { theme?: string; avatarIndex?: number };
  }> {
    const res = await this.rawFetch("/api/stream/settings");
    if (!res.ok) return { ok: false, settings: {} };
    return res.json();
  }

  async getAgentStatus(options?: {
    signal?: AbortSignal;
  }): Promise<AgentStatus> {
    // Our self-hosted agents expose /api/status (not /api/agent/status).
    // Try /api/status first (returns agentName, state, uptime directly),
    // then fall back to /api/agent/status for compatibility with older or
    // partially implemented backends.
    const fetchOpts: RequestInit = { method: "GET" };
    if (options?.signal) fetchOpts.signal = options.signal;

    const primary = await this.rawFetch("/api/status", fetchOpts);
    if (primary.ok) {
      try {
        const data = (await primary.json()) as {
          state?: string;
          agentName?: string;
          uptime?: number;
          memories?: number;
          model?: string;
        };
        if (data.state) {
          return {
            state: normalizeAgentState(data.state),
            agentName: data.agentName ?? "Agent",
            model: data.model ?? "—",
            uptime: data.uptime,
            memories: data.memories,
          };
        }
      } catch {
        // Invalid JSON from /api/status; fall through to the throw below.
      }
    } else if (primary.status === 401 || primary.status === 403) {
      // If /api/status is auth-gated and we don't have a token, the agent is
      // alive but protected. Return a synthetic "running" response immediately.
      if (!this.authToken) {
        return makeUnauthenticatedAgentStatus();
      }
      // We have a token but it was rejected — that's a real auth failure.
      throw new Error(`API ${primary.status}: /api/status`);
    } else if (primary.status !== 404) {
      throw new Error(`API ${primary.status}: /api/status`);
    }

    throw new Error(`API ${primary.status}: /api/status`);
  }

  async startAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/start", { method: "POST" });
  }

  async stopAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/stop", { method: "POST" });
  }

  async pauseAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/pause", { method: "POST" });
  }

  async resumeAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/resume", { method: "POST" });
  }

  async playAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    await this.startAgent();
    return this.resumeAgent();
  }

  async exportAgent(password: string, includeLogs?: boolean): Promise<Blob> {
    const headers = this.buildHeaders();
    headers.set("Content-Type", "application/json");

    const res = await fetch(`${this.baseUrl}/api/agent/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password, includeLogs }),
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  }

  async estimateExportSize(): Promise<{ sizeBytes: number }> {
    return this.request("/api/agent/export/estimate", { method: "GET" });
  }

  async importAgent(file: File, password: string): Promise<{ ok: boolean }> {
    const passwordBytes = new TextEncoder().encode(password);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const lengthBuf = new ArrayBuffer(4);
    new DataView(lengthBuf).setUint32(0, passwordBytes.length);
    const envelope = new Blob([lengthBuf, passwordBytes, fileBytes]);
    const res = await fetch(`${this.baseUrl}/api/agent/import`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: envelope,
    });
    if (!res.ok) throw new Error(`Import failed: ${res.status}`);
    return res.json();
  }

  async getMetrics(): Promise<MetricsData[]> {
    return this.request("/api/metrics", { method: "GET" });
  }

  async getLogs(opts?: {
    limit?: number;
    level?: string;
  }): Promise<LogEntry[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.level) params.set("level", opts.level);
    const qs = params.toString();
    return this.request(`/api/logs${qs ? `?${qs}` : ""}`, { method: "GET" });
  }

  async getBilling(): Promise<object> {
    return this.request("/api/billing", { method: "GET" });
  }

  // Wallet

  async getWalletAddresses(): Promise<WalletAddressesResponse> {
    return this.request("/api/wallet/addresses", { method: "GET" });
  }

  async getWalletBalances(): Promise<WalletBalancesResponse> {
    return this.request("/api/wallet/balances", { method: "GET" });
  }

  async getStewardStatus(): Promise<StewardStatusResponse> {
    return this.request("/api/wallet/steward-status", { method: "GET" });
  }

  async getStewardTxRecords(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    records: StewardTxRecord[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const params = new URLSearchParams();
    if (options?.status) params.set("status", options.status);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const qs = params.toString();
    return this.request(`/api/wallet/steward-tx-records${qs ? `?${qs}` : ""}`, {
      method: "GET",
    });
  }

  async getStewardPendingApprovals(): Promise<StewardPendingApproval[]> {
    return this.request("/api/wallet/steward-pending-approvals", {
      method: "GET",
    });
  }

  async approveStewardTx(txId: string): Promise<StewardApprovalActionResponse> {
    return this.request("/api/wallet/steward-approve-tx", {
      method: "POST",
      body: JSON.stringify({ txId }),
    });
  }

  async denyStewardTx(
    txId: string,
    reason?: string,
  ): Promise<StewardApprovalActionResponse> {
    return this.request("/api/wallet/steward-deny-tx", {
      method: "POST",
      body: JSON.stringify({ txId, ...(reason ? { reason } : {}) }),
    });
  }

  async getStewardPolicies(): Promise<StewardPolicyRule[]> {
    return this.request("/api/wallet/steward-policies", { method: "GET" });
  }

  async setStewardPolicies(
    policies: StewardPolicyRule[],
  ): Promise<{ ok: boolean }> {
    return this.request("/api/wallet/steward-policies", {
      method: "PUT",
      body: JSON.stringify({ policies }),
    });
  }
}
