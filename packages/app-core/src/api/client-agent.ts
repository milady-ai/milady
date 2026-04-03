/**
 * Agent domain methods — lifecycle, auth, config, connectors, triggers,
 * training, plugins, streaming/PTY, logs, character, permissions, updates.
 */

import type { ReleaseChannel } from "@miladyai/agent/contracts/config";
import type {
  AllPermissionsState,
  PermissionState,
  SystemPermissionId,
} from "@miladyai/agent/contracts/permissions";
import {
  isMiladySettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@miladyai/shared";
import type {
  OnboardingConnectorConfig as ConnectorConfig,
  OnboardingData,
  OnboardingOptions,
  SubscriptionStatusResponse,
} from "@miladyai/shared/contracts/onboarding";
import { MiladyClient } from "./client-base";
import type {
  AgentAutomationMode,
  AgentAutomationModeResponse,
  AgentEventsResponse,
  AgentSelfStatusSnapshot,
  AgentStatus,
  CharacterData,
  CodingAgentScratchWorkspace,
  CodingAgentStatus,
  ConfigSchemaResponse,
  CorePluginsResponse,
  CreateTriggerRequest,
  ExtensionStatus,
  LogEntry,
  LogsFilter,
  LogsResponse,
  PluginInfo,
  RawPtySession,
  RuntimeDebugSnapshot,
  SecretInfo,
  SecurityAuditEntry,
  SecurityAuditEventType,
  SecurityAuditFilter,
  SecurityAuditResponse,
  SecurityAuditSeverity,
  SecurityAuditStreamEvent,
  StartTrainingOptions,
  TradePermissionMode,
  TradePermissionModeResponse,
  TrainingDatasetRecord,
  TrainingJobRecord,
  TrainingModelRecord,
  TrainingStatus,
  TrainingTrajectoryDetail,
  TrainingTrajectoryList,
  TriggerHealthSnapshot,
  TriggerLastStatus,
  TriggerRunRecord,
  TriggerSummary,
  UpdateStatus,
  UpdateTriggerRequest,
} from "./client-types";
import { ApiError, mapPtySessionsToCodingAgentSessions } from "./client-types";

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function miladyClientSettingsDebug(): boolean {
  let viteEnv: Record<string, unknown> | undefined;
  try {
    viteEnv = import.meta.env as Record<string, unknown>;
  } catch {
    viteEnv = undefined;
  }
  return isMiladySettingsDebugEnabled({
    importMetaEnv: viteEnv,
    env: typeof process !== "undefined" ? process.env : undefined,
  });
}

function logSettingsClient(
  phase: string,
  detail: Record<string, unknown>,
): void {
  if (!miladyClientSettingsDebug()) return;
  console.debug(
    `[milady][settings][client] ${phase}`,
    sanitizeForSettingsDebug(detail),
  );
}

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    getStatus(): Promise<AgentStatus>;
    getAgentSelfStatus(): Promise<AgentSelfStatusSnapshot>;
    getRuntimeSnapshot(opts?: {
      depth?: number;
      maxArrayLength?: number;
      maxObjectEntries?: number;
      maxStringLength?: number;
    }): Promise<RuntimeDebugSnapshot>;
    setAutomationMode(
      mode: "connectors-only" | "full",
    ): Promise<{ mode: string }>;
    setTradeMode(
      mode: string,
    ): Promise<{ ok: boolean; tradePermissionMode: string }>;
    playEmote(emoteId: string): Promise<{ ok: boolean }>;
    runTerminalCommand(command: string): Promise<{ ok: boolean }>;
    getOnboardingStatus(): Promise<{ complete: boolean; cloudProvisioned?: boolean }>;
    getWalletKeys(): Promise<{
      evmPrivateKey: string;
      evmAddress: string;
      solanaPrivateKey: string;
      solanaAddress: string;
    }>;
    getWalletOsStoreStatus(): Promise<{
      backend: string;
      available: boolean;
      readEnabled: boolean;
      vaultId: string;
    }>;
    postWalletOsStoreAction(action: "migrate" | "delete"): Promise<{
      ok: boolean;
      migrated?: string[];
      failed?: string[];
      error?: string;
    }>;
    getAuthStatus(): Promise<{
      required: boolean;
      pairingEnabled: boolean;
      expiresAt: number | null;
    }>;
    pair(code: string): Promise<{ token: string }>;
    getOnboardingOptions(): Promise<OnboardingOptions>;
    submitOnboarding(data: OnboardingData): Promise<void>;
    startAnthropicLogin(): Promise<{ authUrl: string }>;
    exchangeAnthropicCode(code: string): Promise<{
      success: boolean;
      expiresAt?: string;
      error?: string;
    }>;
    submitAnthropicSetupToken(token: string): Promise<{ success: boolean }>;
    getSubscriptionStatus(): Promise<SubscriptionStatusResponse>;
    deleteSubscription(provider: string): Promise<{ success: boolean }>;
    switchProvider(
      provider: string,
      apiKey?: string,
      primaryModel?: string,
    ): Promise<{ success: boolean; provider: string; restarting: boolean }>;
    startOpenAILogin(): Promise<{
      authUrl: string;
      state: string;
      instructions: string;
    }>;
    exchangeOpenAICode(code: string): Promise<{
      success: boolean;
      expiresAt?: string;
      accountId?: string;
      error?: string;
    }>;
    startAgent(): Promise<AgentStatus>;
    stopAgent(): Promise<AgentStatus>;
    pauseAgent(): Promise<AgentStatus>;
    resumeAgent(): Promise<AgentStatus>;
    restartAgent(): Promise<AgentStatus>;
    restartAndWait(maxWaitMs?: number): Promise<AgentStatus>;
    resetAgent(): Promise<void>;
    restart(): Promise<{ ok: boolean }>;
    getConfig(): Promise<Record<string, unknown>>;
    getConfigSchema(): Promise<ConfigSchemaResponse>;
    updateConfig(
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
    uploadCustomVrm(file: File): Promise<void>;
    hasCustomVrm(): Promise<boolean>;
    uploadCustomBackground(file: File): Promise<void>;
    hasCustomBackground(): Promise<boolean>;
    getConnectors(): Promise<{
      connectors: Record<string, ConnectorConfig>;
    }>;
    saveConnector(
      name: string,
      config: ConnectorConfig,
    ): Promise<{ connectors: Record<string, ConnectorConfig> }>;
    deleteConnector(
      name: string,
    ): Promise<{ connectors: Record<string, ConnectorConfig> }>;
    getTriggers(): Promise<{ triggers: TriggerSummary[] }>;
    getTrigger(id: string): Promise<{ trigger: TriggerSummary }>;
    createTrigger(
      request: CreateTriggerRequest,
    ): Promise<{ trigger: TriggerSummary }>;
    updateTrigger(
      id: string,
      request: UpdateTriggerRequest,
    ): Promise<{ trigger: TriggerSummary }>;
    deleteTrigger(id: string): Promise<{ ok: boolean }>;
    runTriggerNow(id: string): Promise<{
      ok: boolean;
      result: {
        status: TriggerLastStatus;
        error?: string;
        taskDeleted: boolean;
      };
      trigger?: TriggerSummary;
    }>;
    getTriggerRuns(id: string): Promise<{ runs: TriggerRunRecord[] }>;
    getTriggerHealth(): Promise<TriggerHealthSnapshot>;
    getTrainingStatus(): Promise<TrainingStatus>;
    listTrainingTrajectories(opts?: {
      limit?: number;
      offset?: number;
    }): Promise<TrainingTrajectoryList>;
    getTrainingTrajectory(
      trajectoryId: string,
    ): Promise<{ trajectory: TrainingTrajectoryDetail }>;
    listTrainingDatasets(): Promise<{ datasets: TrainingDatasetRecord[] }>;
    buildTrainingDataset(options?: {
      limit?: number;
      minLlmCallsPerTrajectory?: number;
    }): Promise<{ dataset: TrainingDatasetRecord }>;
    listTrainingJobs(): Promise<{ jobs: TrainingJobRecord[] }>;
    startTrainingJob(
      options?: StartTrainingOptions,
    ): Promise<{ job: TrainingJobRecord }>;
    getTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }>;
    cancelTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }>;
    listTrainingModels(): Promise<{ models: TrainingModelRecord[] }>;
    importTrainingModelToOllama(
      modelId: string,
      options?: {
        modelName?: string;
        baseModel?: string;
        ollamaUrl?: string;
      },
    ): Promise<{ model: TrainingModelRecord }>;
    activateTrainingModel(
      modelId: string,
      providerModel?: string,
    ): Promise<{
      modelId: string;
      providerModel: string;
      needsRestart: boolean;
    }>;
    benchmarkTrainingModel(modelId: string): Promise<{
      status: "passed" | "failed";
      output: string;
    }>;
    getPlugins(): Promise<{ plugins: PluginInfo[] }>;
    fetchModels(
      provider: string,
      refresh?: boolean,
    ): Promise<{ provider: string; models: unknown[] }>;
    getCorePlugins(): Promise<CorePluginsResponse>;
    toggleCorePlugin(
      npmName: string,
      enabled: boolean,
    ): Promise<{ ok: boolean; restarting?: boolean; message?: string }>;
    updatePlugin(
      id: string,
      config: Record<string, unknown>,
    ): Promise<{ ok: boolean; restarting?: boolean }>;
    getSecrets(): Promise<{ secrets: SecretInfo[] }>;
    updateSecrets(
      secrets: Record<string, string>,
    ): Promise<{ ok: boolean; updated: string[] }>;
    testPluginConnection(id: string): Promise<{
      success: boolean;
      pluginId: string;
      message?: string;
      error?: string;
      durationMs: number;
    }>;
    getLogs(filter?: LogsFilter): Promise<LogsResponse>;
    getSecurityAudit(
      filter?: SecurityAuditFilter,
    ): Promise<SecurityAuditResponse>;
    streamSecurityAudit(
      onEvent: (event: SecurityAuditStreamEvent) => void,
      filter?: SecurityAuditFilter,
      signal?: AbortSignal,
    ): Promise<void>;
    getAgentEvents(opts?: {
      afterEventId?: string;
      limit?: number;
      runId?: string;
      fromSeq?: number;
    }): Promise<AgentEventsResponse>;
    getExtensionStatus(): Promise<ExtensionStatus>;
    getCharacter(): Promise<{
      character: CharacterData;
      agentName: string;
    }>;
    getRandomName(): Promise<{ name: string }>;
    generateCharacterField(
      field: string,
      context: {
        name?: string;
        system?: string;
        bio?: string;
        topics?: string[];
        style?: { all?: string[]; chat?: string[]; post?: string[] };
        postExamples?: string[];
      },
      mode?: "append" | "replace",
    ): Promise<{ generated: string }>;
    updateCharacter(
      character: CharacterData,
    ): Promise<{ ok: boolean; character: CharacterData; agentName: string }>;
    getUpdateStatus(force?: boolean): Promise<UpdateStatus>;
    setUpdateChannel(
      channel: "stable" | "beta" | "nightly",
    ): Promise<{ channel: string }>;
    getAgentAutomationMode(): Promise<AgentAutomationModeResponse>;
    setAgentAutomationMode(
      mode: AgentAutomationMode,
    ): Promise<AgentAutomationModeResponse>;
    getTradePermissionMode(): Promise<TradePermissionModeResponse>;
    setTradePermissionMode(
      mode: TradePermissionMode,
    ): Promise<TradePermissionModeResponse>;
    getPermissions(): Promise<AllPermissionsState>;
    getPermission(id: SystemPermissionId): Promise<PermissionState>;
    requestPermission(id: SystemPermissionId): Promise<PermissionState>;
    openPermissionSettings(id: SystemPermissionId): Promise<void>;
    refreshPermissions(): Promise<AllPermissionsState>;
    setShellEnabled(enabled: boolean): Promise<PermissionState>;
    isShellEnabled(): Promise<boolean>;
    getCodingAgentStatus(): Promise<CodingAgentStatus | null>;
    stopCodingAgent(sessionId: string): Promise<boolean>;
    listCodingAgentScratchWorkspaces(): Promise<CodingAgentScratchWorkspace[]>;
    keepCodingAgentScratchWorkspace(sessionId: string): Promise<boolean>;
    deleteCodingAgentScratchWorkspace(sessionId: string): Promise<boolean>;
    promoteCodingAgentScratchWorkspace(
      sessionId: string,
      name?: string,
    ): Promise<CodingAgentScratchWorkspace | null>;
    subscribePtyOutput(sessionId: string): void;
    unsubscribePtyOutput(sessionId: string): void;
    sendPtyInput(sessionId: string, data: string): void;
    resizePty(sessionId: string, cols: number, rows: number): void;
    getPtyBufferedOutput(sessionId: string): Promise<string>;
    streamGoLive(): Promise<{
      ok: boolean;
      live: boolean;
      rtmpUrl?: string;
      inputMode?: string;
      audioSource?: string;
      message?: string;
      destination?: string;
    }>;
    streamGoOffline(): Promise<{ ok: boolean; live: boolean }>;
    streamStatus(): Promise<{
      ok: boolean;
      running: boolean;
      ffmpegAlive: boolean;
      uptime: number;
      frameCount: number;
      volume: number;
      muted: boolean;
      audioSource: string;
      inputMode: string | null;
      destination?: { id: string; name: string } | null;
    }>;
    getStreamingDestinations(): Promise<{
      ok: boolean;
      destinations: Array<{ id: string; name: string }>;
    }>;
    setActiveDestination(destinationId: string): Promise<{
      ok: boolean;
      destination?: { id: string; name: string };
    }>;
    setStreamVolume(
      volume: number,
    ): Promise<{ ok: boolean; volume: number; muted: boolean }>;
    muteStream(): Promise<{ ok: boolean; muted: boolean; volume: number }>;
    unmuteStream(): Promise<{ ok: boolean; muted: boolean; volume: number }>;
    getStreamVoice(): Promise<{
      ok: boolean;
      enabled: boolean;
      autoSpeak: boolean;
      provider: string | null;
      configuredProvider: string | null;
      hasApiKey: boolean;
      isSpeaking: boolean;
      isAttached: boolean;
    }>;
    saveStreamVoice(settings: {
      enabled?: boolean;
      autoSpeak?: boolean;
      provider?: string;
    }): Promise<{
      ok: boolean;
      voice: { enabled: boolean; autoSpeak: boolean };
    }>;
    streamVoiceSpeak(text: string): Promise<{ ok: boolean; speaking: boolean }>;
    getOverlayLayout(
      destinationId?: string | null,
    ): Promise<{ ok: boolean; layout: unknown; destinationId?: string }>;
    saveOverlayLayout(
      layout: unknown,
      destinationId?: string | null,
    ): Promise<{ ok: boolean; layout: unknown; destinationId?: string }>;
    getStreamSource(): Promise<{
      source: { type: string; url?: string };
    }>;
    setStreamSource(
      sourceType: string,
      customUrl?: string,
    ): Promise<{ ok: boolean; source: { type: string; url?: string } }>;
    getStreamSettings(): Promise<{
      ok: boolean;
      settings: { theme?: string; avatarIndex?: number };
    }>;
    saveStreamSettings(settings: {
      theme?: string;
      avatarIndex?: number;
    }): Promise<{ ok: boolean; settings: unknown }>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

MiladyClient.prototype.getStatus = async function (this: MiladyClient) {
  return this.fetch("/api/status");
};

MiladyClient.prototype.getAgentSelfStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/agent/self-status");
};

MiladyClient.prototype.getRuntimeSnapshot = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (typeof opts?.depth === "number") params.set("depth", String(opts.depth));
  if (typeof opts?.maxArrayLength === "number") {
    params.set("maxArrayLength", String(opts.maxArrayLength));
  }
  if (typeof opts?.maxObjectEntries === "number") {
    params.set("maxObjectEntries", String(opts.maxObjectEntries));
  }
  if (typeof opts?.maxStringLength === "number") {
    params.set("maxStringLength", String(opts.maxStringLength));
  }
  const qs = params.toString();
  return this.fetch(`/api/runtime${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.setAutomationMode = async function (
  this: MiladyClient,
  mode,
) {
  return this.fetch("/api/permissions/automation-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

MiladyClient.prototype.setTradeMode = async function (
  this: MiladyClient,
  mode,
) {
  return this.fetch("/api/permissions/trade-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

MiladyClient.prototype.playEmote = async function (
  this: MiladyClient,
  emoteId,
) {
  return this.fetch("/api/emote", {
    method: "POST",
    body: JSON.stringify({ emoteId }),
  });
};

MiladyClient.prototype.runTerminalCommand = async function (
  this: MiladyClient,
  command,
) {
  return this.fetch("/api/terminal/run", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
};

MiladyClient.prototype.getOnboardingStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/onboarding/status");
};

MiladyClient.prototype.getWalletKeys = async function (this: MiladyClient) {
  return this.fetch("/api/wallet/keys");
};

MiladyClient.prototype.getWalletOsStoreStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/wallet/os-store");
};

MiladyClient.prototype.postWalletOsStoreAction = async function (
  this: MiladyClient,
  action,
) {
  return this.fetch("/api/wallet/os-store", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
};

MiladyClient.prototype.getAuthStatus = async function (this: MiladyClient) {
  const maxRetries = 3;
  const baseBackoffMs = 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await this.fetch("/api/auth/status");
    } catch (err: unknown) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401) {
        return { required: true, pairingEnabled: false, expiresAt: null };
      }
      if (status === 404) {
        return { required: false, pairingEnabled: false, expiresAt: null };
      }
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseBackoffMs * 2 ** attempt));
      }
    }
  }
  throw lastErr;
};

MiladyClient.prototype.pair = async function (this: MiladyClient, code) {
  const res = await this.fetch<{ token: string }>("/api/auth/pair", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return res;
};

MiladyClient.prototype.getOnboardingOptions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/onboarding/options");
};

MiladyClient.prototype.submitOnboarding = async function (
  this: MiladyClient,
  data,
) {
  await this.fetch("/api/onboarding", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.startAnthropicLogin = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/subscription/anthropic/start", { method: "POST" });
};

MiladyClient.prototype.exchangeAnthropicCode = async function (
  this: MiladyClient,
  code,
) {
  return this.fetch("/api/subscription/anthropic/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
};

MiladyClient.prototype.submitAnthropicSetupToken = async function (
  this: MiladyClient,
  token,
) {
  return this.fetch("/api/subscription/anthropic/setup-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
};

MiladyClient.prototype.getSubscriptionStatus = async function (
  this: MiladyClient,
) {
  return this.fetch<SubscriptionStatusResponse>("/api/subscription/status");
};

MiladyClient.prototype.deleteSubscription = async function (
  this: MiladyClient,
  provider,
) {
  return this.fetch(`/api/subscription/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.switchProvider = async function (
  this: MiladyClient,
  provider,
  apiKey?,
  primaryModel?,
) {
  logSettingsClient("POST /api/provider/switch → start", {
    baseUrl: this.getBaseUrl(),
    provider,
    hasApiKey: Boolean(apiKey?.trim()),
    apiKey,
    hasPrimaryModel: Boolean(primaryModel?.trim()),
    primaryModel,
  });
  const result = (await this.fetch("/api/provider/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      ...(apiKey ? { apiKey } : {}),
      ...(primaryModel ? { primaryModel } : {}),
    }),
  })) as { success: boolean; provider: string; restarting: boolean };
  logSettingsClient("POST /api/provider/switch ← ok", {
    baseUrl: this.getBaseUrl(),
    result,
  });
  return result;
};

MiladyClient.prototype.startOpenAILogin = async function (this: MiladyClient) {
  return this.fetch("/api/subscription/openai/start", { method: "POST" });
};

MiladyClient.prototype.exchangeOpenAICode = async function (
  this: MiladyClient,
  code,
) {
  return this.fetch("/api/subscription/openai/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
};

MiladyClient.prototype.startAgent = async function (this: MiladyClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/start", {
    method: "POST",
  });
  return res.status;
};

MiladyClient.prototype.stopAgent = async function (this: MiladyClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/stop", {
    method: "POST",
  });
  return res.status;
};

MiladyClient.prototype.pauseAgent = async function (this: MiladyClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/pause", {
    method: "POST",
  });
  return res.status;
};

MiladyClient.prototype.resumeAgent = async function (this: MiladyClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/resume", {
    method: "POST",
  });
  return res.status;
};

MiladyClient.prototype.restartAgent = async function (this: MiladyClient) {
  const res = await this.fetch<{ status: AgentStatus }>("/api/agent/restart", {
    method: "POST",
  });
  return res.status;
};

MiladyClient.prototype.restartAndWait = async function (
  this: MiladyClient,
  maxWaitMs = 30000,
) {
  const t0 = Date.now();
  console.info("[milady][reset][client] restartAndWait: begin", {
    baseUrl: this.getBaseUrl(),
    maxWaitMs,
  });
  try {
    await this.restartAgent();
    console.info(
      "[milady][reset][client] restartAndWait: POST /api/agent/restart accepted",
    );
  } catch (e) {
    console.info(
      "[milady][reset][client] restartAndWait: initial restart call failed (often 409 while restarting)",
      e,
    );
  }
  const start = Date.now();
  const interval = 1000;
  let pollN = 0;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, interval));
    pollN += 1;
    try {
      const status = await this.getStatus();
      if (status.state === "running") {
        console.info("[milady][reset][client] restartAndWait: running", {
          pollN,
          waitedMs: Date.now() - t0,
          port: status.port,
        });
        return status;
      }
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug("[milady][reset][client] restartAndWait: poll", {
          pollN,
          state: status.state,
          waitedMs: Date.now() - t0,
        });
      }
    } catch (pollErr) {
      if (pollN === 1 || pollN % 5 === 0) {
        console.debug(
          "[milady][reset][client] restartAndWait: getStatus error while polling",
          { pollN, waitedMs: Date.now() - t0 },
          pollErr,
        );
      }
    }
  }
  const final = await this.getStatus();
  console.warn(
    "[milady][reset][client] restartAndWait: timed out — returning last status",
    {
      state: final.state,
      waitedMs: Date.now() - t0,
      maxWaitMs,
    },
  );
  return final;
};

MiladyClient.prototype.resetAgent = async function (this: MiladyClient) {
  console.info("[milady][reset][client] POST /api/agent/reset", {
    baseUrl: this.getBaseUrl(),
  });
  await this.fetch("/api/agent/reset", { method: "POST" });
  console.info("[milady][reset][client] POST /api/agent/reset OK");
};

MiladyClient.prototype.restart = async function (this: MiladyClient) {
  return this.fetch("/api/restart", { method: "POST" });
};

MiladyClient.prototype.getConfig = async function (this: MiladyClient) {
  logSettingsClient("GET /api/config → start", {
    baseUrl: this.getBaseUrl(),
  });
  const r = (await this.fetch("/api/config")) as Record<string, unknown>;
  const cloud = r.cloud as Record<string, unknown> | undefined;
  logSettingsClient("GET /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(r).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return r;
};

MiladyClient.prototype.getConfigSchema = async function (this: MiladyClient) {
  return this.fetch("/api/config/schema");
};

MiladyClient.prototype.updateConfig = async function (
  this: MiladyClient,
  patch,
) {
  logSettingsClient("PUT /api/config → start", {
    baseUrl: this.getBaseUrl(),
    patch,
  });
  const out = (await this.fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })) as Record<string, unknown>;
  const cloud = out.cloud as Record<string, unknown> | undefined;
  logSettingsClient("PUT /api/config ← ok", {
    baseUrl: this.getBaseUrl(),
    topKeys: Object.keys(out).sort(),
    cloud: settingsDebugCloudSummary(cloud),
  });
  return out;
};

MiladyClient.prototype.uploadCustomVrm = async function (
  this: MiladyClient,
  file,
) {
  const buf = await file.arrayBuffer();
  await this.fetch("/api/avatar/vrm", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
};

MiladyClient.prototype.hasCustomVrm = async function (this: MiladyClient) {
  try {
    const res = await this.rawRequest(
      "/api/avatar/vrm",
      { method: "HEAD" },
      { allowNonOk: true },
    );
    return res.ok;
  } catch {
    return false;
  }
};

MiladyClient.prototype.uploadCustomBackground = async function (
  this: MiladyClient,
  file,
) {
  const buf = await file.arrayBuffer();
  await this.fetch("/api/avatar/background", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: buf,
  });
};

MiladyClient.prototype.hasCustomBackground = async function (
  this: MiladyClient,
) {
  try {
    const res = await this.rawRequest(
      "/api/avatar/background",
      { method: "HEAD" },
      { allowNonOk: true },
    );
    return res.ok;
  } catch {
    return false;
  }
};

MiladyClient.prototype.getConnectors = async function (this: MiladyClient) {
  return this.fetch("/api/connectors");
};

MiladyClient.prototype.saveConnector = async function (
  this: MiladyClient,
  name,
  config,
) {
  return this.fetch("/api/connectors", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
};

MiladyClient.prototype.deleteConnector = async function (
  this: MiladyClient,
  name,
) {
  return this.fetch(`/api/connectors/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.getTriggers = async function (this: MiladyClient) {
  return this.fetch("/api/triggers");
};

MiladyClient.prototype.getTrigger = async function (this: MiladyClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`);
};

MiladyClient.prototype.createTrigger = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/triggers", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.updateTrigger = async function (
  this: MiladyClient,
  id,
  request,
) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.deleteTrigger = async function (this: MiladyClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.runTriggerNow = async function (this: MiladyClient, id) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}/execute`, {
    method: "POST",
  });
};

MiladyClient.prototype.getTriggerRuns = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/triggers/${encodeURIComponent(id)}/runs`);
};

MiladyClient.prototype.getTriggerHealth = async function (this: MiladyClient) {
  return this.fetch("/api/triggers/health");
};

MiladyClient.prototype.getTrainingStatus = async function (this: MiladyClient) {
  return this.fetch("/api/training/status");
};

MiladyClient.prototype.listTrainingTrajectories = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (typeof opts?.offset === "number")
    params.set("offset", String(opts.offset));
  const qs = params.toString();
  return this.fetch(`/api/training/trajectories${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getTrainingTrajectory = async function (
  this: MiladyClient,
  trajectoryId,
) {
  return this.fetch(
    `/api/training/trajectories/${encodeURIComponent(trajectoryId)}`,
  );
};

MiladyClient.prototype.listTrainingDatasets = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/training/datasets");
};

MiladyClient.prototype.buildTrainingDataset = async function (
  this: MiladyClient,
  options?,
) {
  return this.fetch("/api/training/datasets/build", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
};

MiladyClient.prototype.listTrainingJobs = async function (this: MiladyClient) {
  return this.fetch("/api/training/jobs");
};

MiladyClient.prototype.startTrainingJob = async function (
  this: MiladyClient,
  options?,
) {
  return this.fetch("/api/training/jobs", {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
};

MiladyClient.prototype.getTrainingJob = async function (
  this: MiladyClient,
  jobId,
) {
  return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}`);
};

MiladyClient.prototype.cancelTrainingJob = async function (
  this: MiladyClient,
  jobId,
) {
  return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
};

MiladyClient.prototype.listTrainingModels = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/training/models");
};

MiladyClient.prototype.importTrainingModelToOllama = async function (
  this: MiladyClient,
  modelId,
  options?,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/import-ollama`,
    {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    },
  );
};

MiladyClient.prototype.activateTrainingModel = async function (
  this: MiladyClient,
  modelId,
  providerModel?,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/activate`,
    {
      method: "POST",
      body: JSON.stringify({ providerModel }),
    },
  );
};

MiladyClient.prototype.benchmarkTrainingModel = async function (
  this: MiladyClient,
  modelId,
) {
  return this.fetch(
    `/api/training/models/${encodeURIComponent(modelId)}/benchmark`,
    { method: "POST" },
  );
};

MiladyClient.prototype.getPlugins = async function (this: MiladyClient) {
  return this.fetch("/api/plugins");
};

MiladyClient.prototype.fetchModels = async function (
  this: MiladyClient,
  provider,
  refresh = true,
) {
  const params = new URLSearchParams({ provider });
  if (refresh) params.set("refresh", "true");
  return this.fetch(`/api/models?${params.toString()}`);
};

MiladyClient.prototype.getCorePlugins = async function (this: MiladyClient) {
  return this.fetch("/api/plugins/core");
};

MiladyClient.prototype.toggleCorePlugin = async function (
  this: MiladyClient,
  npmName,
  enabled,
) {
  return this.fetch("/api/plugins/core/toggle", {
    method: "POST",
    body: JSON.stringify({ npmName, enabled }),
  });
};

MiladyClient.prototype.updatePlugin = async function (
  this: MiladyClient,
  id,
  config,
) {
  logSettingsClient(`PUT /api/plugins/${id} → start`, {
    baseUrl: this.getBaseUrl(),
    body: config,
  });
  const result = (await this.fetch(`/api/plugins/${id}`, {
    method: "PUT",
    body: JSON.stringify(config),
  })) as { ok: boolean; restarting?: boolean };
  logSettingsClient(`PUT /api/plugins/${id} ← ok`, {
    baseUrl: this.getBaseUrl(),
    result,
  });
  return result;
};

MiladyClient.prototype.getSecrets = async function (this: MiladyClient) {
  return this.fetch("/api/secrets");
};

MiladyClient.prototype.updateSecrets = async function (
  this: MiladyClient,
  secrets,
) {
  logSettingsClient("PUT /api/secrets → start", {
    baseUrl: this.getBaseUrl(),
    secretMeta: Object.keys(secrets)
      .sort()
      .map((key) => ({
        key,
        hasValue: Boolean(secrets[key]),
      })),
  });
  const out = (await this.fetch("/api/secrets", {
    method: "PUT",
    body: JSON.stringify({ secrets }),
  })) as { ok: boolean; updated: string[] };
  logSettingsClient("PUT /api/secrets ← ok", {
    baseUrl: this.getBaseUrl(),
    out,
  });
  return out;
};

MiladyClient.prototype.testPluginConnection = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/plugins/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
};

MiladyClient.prototype.getLogs = async function (this: MiladyClient, filter?) {
  const params = new URLSearchParams();
  if (filter?.source) params.set("source", filter.source);
  if (filter?.level) params.set("level", filter.level);
  if (filter?.tag) params.set("tag", filter.tag);
  if (filter?.since) params.set("since", String(filter.since));
  const qs = params.toString();
  return this.fetch(`/api/logs${qs ? `?${qs}` : ""}`);
};

// buildSecurityAuditParams is a private helper used only by agent audit methods
function buildSecurityAuditParams(
  filter?: SecurityAuditFilter,
  includeStream = false,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter?.type) params.set("type", filter.type);
  if (filter?.severity) params.set("severity", filter.severity);
  if (filter?.since !== undefined) {
    const sinceValue =
      filter.since instanceof Date
        ? filter.since.toISOString()
        : String(filter.since);
    params.set("since", sinceValue);
  }
  if (filter?.limit !== undefined) params.set("limit", String(filter.limit));
  if (includeStream) params.set("stream", "1");
  return params;
}

MiladyClient.prototype.getSecurityAudit = async function (
  this: MiladyClient,
  filter?,
) {
  const qs = buildSecurityAuditParams(filter).toString();
  return this.fetch(`/api/security/audit${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.streamSecurityAudit = async function (
  this: MiladyClient,
  onEvent,
  filter?,
  signal?,
) {
  if (!this.apiAvailable) {
    throw new Error("API not available (no HTTP origin)");
  }

  const token = this.apiToken;
  const qs = buildSecurityAuditParams(filter, true).toString();
  const res = await fetch(
    `${this.baseUrl}/api/security/audit${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    },
  );

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: res.statusText }))) as Record<
      string,
      string
    > | null;
    const err = new Error(body?.error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  if (!res.body) {
    throw new Error("Streaming not supported by this browser");
  }

  const parsePayload = (payload: string) => {
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as SecurityAuditStreamEvent;
      if (parsed.type === "snapshot" || parsed.type === "entry") {
        onEvent(parsed);
      }
    } catch {
      // Ignore malformed payloads to keep stream consumption resilient.
    }
  };

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = "";

  const findSseEventBreak = (
    chunkBuffer: string,
  ): { index: number; length: number } | null => {
    const lfBreak = chunkBuffer.indexOf("\n\n");
    const crlfBreak = chunkBuffer.indexOf("\r\n\r\n");
    if (lfBreak === -1 && crlfBreak === -1) return null;
    if (lfBreak === -1) return { index: crlfBreak, length: 4 };
    if (crlfBreak === -1) return { index: lfBreak, length: 2 };
    return lfBreak < crlfBreak
      ? { index: lfBreak, length: 2 }
      : { index: crlfBreak, length: 4 };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let eventBreak = findSseEventBreak(buffer);
    while (eventBreak) {
      const rawEvent = buffer.slice(0, eventBreak.index);
      buffer = buffer.slice(eventBreak.index + eventBreak.length);
      for (const line of rawEvent.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        parsePayload(line.slice(5).trim());
      }
      eventBreak = findSseEventBreak(buffer);
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      parsePayload(line.slice(5).trim());
    }
  }
};

MiladyClient.prototype.getAgentEvents = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.afterEventId) params.set("after", opts.afterEventId);
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (opts?.runId) params.set("runId", opts.runId);
  if (typeof opts?.fromSeq === "number")
    params.set("fromSeq", String(Math.trunc(opts.fromSeq)));
  const qs = params.toString();
  return this.fetch(`/api/agent/events${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getExtensionStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/extension/status");
};

MiladyClient.prototype.getCharacter = async function (this: MiladyClient) {
  return this.fetch("/api/character");
};

MiladyClient.prototype.getRandomName = async function (this: MiladyClient) {
  return this.fetch("/api/character/random-name");
};

MiladyClient.prototype.generateCharacterField = async function (
  this: MiladyClient,
  field,
  context,
  mode?,
) {
  return this.fetch("/api/character/generate", {
    method: "POST",
    body: JSON.stringify({ field, context, mode }),
  });
};

MiladyClient.prototype.updateCharacter = async function (
  this: MiladyClient,
  character,
) {
  return this.fetch("/api/character", {
    method: "PUT",
    body: JSON.stringify(character),
  });
};

MiladyClient.prototype.getUpdateStatus = async function (
  this: MiladyClient,
  force = false,
) {
  return this.fetch(`/api/update/status${force ? "?force=true" : ""}`);
};

MiladyClient.prototype.setUpdateChannel = async function (
  this: MiladyClient,
  channel,
) {
  return this.fetch("/api/update/channel", {
    method: "PUT",
    body: JSON.stringify({ channel }),
  });
};

MiladyClient.prototype.getAgentAutomationMode = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/permissions/automation-mode");
};

MiladyClient.prototype.setAgentAutomationMode = async function (
  this: MiladyClient,
  mode,
) {
  return this.fetch("/api/permissions/automation-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

MiladyClient.prototype.getTradePermissionMode = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/permissions/trade-mode");
};

MiladyClient.prototype.setTradePermissionMode = async function (
  this: MiladyClient,
  mode,
) {
  return this.fetch("/api/permissions/trade-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
};

MiladyClient.prototype.getPermissions = async function (this: MiladyClient) {
  return this.fetch("/api/permissions");
};

MiladyClient.prototype.getPermission = async function (this: MiladyClient, id) {
  return this.fetch(`/api/permissions/${id}`);
};

MiladyClient.prototype.requestPermission = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/permissions/${id}/request`, { method: "POST" });
};

MiladyClient.prototype.openPermissionSettings = async function (
  this: MiladyClient,
  id,
) {
  await this.fetch(`/api/permissions/${id}/open-settings`, {
    method: "POST",
  });
};

MiladyClient.prototype.refreshPermissions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/permissions/refresh", { method: "POST" });
};

MiladyClient.prototype.setShellEnabled = async function (
  this: MiladyClient,
  enabled,
) {
  return this.fetch("/api/permissions/shell", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
};

MiladyClient.prototype.isShellEnabled = async function (this: MiladyClient) {
  const result = await this.fetch<{ enabled: boolean }>(
    "/api/permissions/shell",
  );
  return result.enabled;
};

MiladyClient.prototype.getCodingAgentStatus = async function (
  this: MiladyClient,
) {
  try {
    const status = await this.fetch<CodingAgentStatus>(
      "/api/coding-agents/coordinator/status",
    );
    if (status && (!status.tasks || status.tasks.length === 0)) {
      try {
        const ptySessions =
          await this.fetch<RawPtySession[]>("/api/coding-agents");
        if (Array.isArray(ptySessions) && ptySessions.length > 0) {
          status.tasks = mapPtySessionsToCodingAgentSessions(ptySessions);
          status.taskCount = status.tasks.length;
        }
      } catch {
        // /api/coding-agents may not exist — ignore
      }
    }
    return status;
  } catch {
    return null;
  }
};

MiladyClient.prototype.stopCodingAgent = async function (
  this: MiladyClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/stop`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

MiladyClient.prototype.listCodingAgentScratchWorkspaces = async function (
  this: MiladyClient,
) {
  try {
    return await this.fetch<CodingAgentScratchWorkspace[]>(
      "/api/coding-agents/scratch",
    );
  } catch (err) {
    console.warn(
      "[api-client] Failed to list coding agent scratch workspaces:",
      err,
    );
    return [];
  }
};

MiladyClient.prototype.keepCodingAgentScratchWorkspace = async function (
  this: MiladyClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/keep`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

MiladyClient.prototype.deleteCodingAgentScratchWorkspace = async function (
  this: MiladyClient,
  sessionId,
) {
  try {
    await this.fetch(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/delete`,
      { method: "POST" },
    );
    return true;
  } catch {
    return false;
  }
};

MiladyClient.prototype.promoteCodingAgentScratchWorkspace = async function (
  this: MiladyClient,
  sessionId,
  name?,
) {
  try {
    const response = await this.fetch<{
      success: boolean;
      scratch?: CodingAgentScratchWorkspace;
    }>(`/api/coding-agents/${encodeURIComponent(sessionId)}/scratch/promote`, {
      method: "POST",
      body: JSON.stringify(name ? { name } : {}),
    });
    return response.scratch ?? null;
  } catch {
    return null;
  }
};

MiladyClient.prototype.subscribePtyOutput = function (
  this: MiladyClient,
  sessionId,
) {
  this.sendWsMessage({ type: "pty-subscribe", sessionId });
};

MiladyClient.prototype.unsubscribePtyOutput = function (
  this: MiladyClient,
  sessionId,
) {
  this.sendWsMessage({ type: "pty-unsubscribe", sessionId });
};

MiladyClient.prototype.sendPtyInput = function (
  this: MiladyClient,
  sessionId,
  data,
) {
  this.sendWsMessage({ type: "pty-input", sessionId, data });
};

MiladyClient.prototype.resizePty = function (
  this: MiladyClient,
  sessionId,
  cols,
  rows,
) {
  this.sendWsMessage({ type: "pty-resize", sessionId, cols, rows });
};

MiladyClient.prototype.getPtyBufferedOutput = async function (
  this: MiladyClient,
  sessionId,
) {
  try {
    const res = await this.fetch<{ output: string }>(
      `/api/coding-agents/${encodeURIComponent(sessionId)}/buffered-output`,
    );
    return res.output ?? "";
  } catch {
    return "";
  }
};

MiladyClient.prototype.streamGoLive = async function (this: MiladyClient) {
  return this.fetch("/api/stream/live", { method: "POST" });
};

MiladyClient.prototype.streamGoOffline = async function (this: MiladyClient) {
  return this.fetch("/api/stream/offline", { method: "POST" });
};

MiladyClient.prototype.streamStatus = async function (this: MiladyClient) {
  return this.fetch("/api/stream/status");
};

MiladyClient.prototype.getStreamingDestinations = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/streaming/destinations");
};

MiladyClient.prototype.setActiveDestination = async function (
  this: MiladyClient,
  destinationId,
) {
  return this.fetch("/api/streaming/destination", {
    method: "POST",
    body: JSON.stringify({ destinationId }),
  });
};

MiladyClient.prototype.setStreamVolume = async function (
  this: MiladyClient,
  volume,
) {
  return this.fetch("/api/stream/volume", {
    method: "POST",
    body: JSON.stringify({ volume }),
  });
};

MiladyClient.prototype.muteStream = async function (this: MiladyClient) {
  return this.fetch("/api/stream/mute", { method: "POST" });
};

MiladyClient.prototype.unmuteStream = async function (this: MiladyClient) {
  return this.fetch("/api/stream/unmute", { method: "POST" });
};

MiladyClient.prototype.getStreamVoice = async function (this: MiladyClient) {
  return this.fetch("/api/stream/voice");
};

MiladyClient.prototype.saveStreamVoice = async function (
  this: MiladyClient,
  settings,
) {
  return this.fetch("/api/stream/voice", {
    method: "POST",
    body: JSON.stringify(settings),
  });
};

MiladyClient.prototype.streamVoiceSpeak = async function (
  this: MiladyClient,
  text,
) {
  return this.fetch("/api/stream/voice/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
};

MiladyClient.prototype.getOverlayLayout = async function (
  this: MiladyClient,
  destinationId?,
) {
  const qs = destinationId
    ? `?destination=${encodeURIComponent(destinationId)}`
    : "";
  return this.fetch(`/api/stream/overlay-layout${qs}`);
};

MiladyClient.prototype.saveOverlayLayout = async function (
  this: MiladyClient,
  layout,
  destinationId?,
) {
  const qs = destinationId
    ? `?destination=${encodeURIComponent(destinationId)}`
    : "";
  return this.fetch(`/api/stream/overlay-layout${qs}`, {
    method: "POST",
    body: JSON.stringify({ layout }),
  });
};

MiladyClient.prototype.getStreamSource = async function (this: MiladyClient) {
  return this.fetch("/api/stream/source");
};

MiladyClient.prototype.setStreamSource = async function (
  this: MiladyClient,
  sourceType,
  customUrl?,
) {
  return this.fetch("/api/stream/source", {
    method: "POST",
    body: JSON.stringify({ sourceType, customUrl }),
  });
};

MiladyClient.prototype.getStreamSettings = async function (this: MiladyClient) {
  return this.fetch("/api/stream/settings");
};

MiladyClient.prototype.saveStreamSettings = async function (
  this: MiladyClient,
  settings,
) {
  return this.fetch("/api/stream/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
};
