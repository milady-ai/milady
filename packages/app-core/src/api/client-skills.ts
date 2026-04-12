/**
 * Skills domain methods — skills, catalog, marketplace, apps, Babylon,
 * custom actions, WhatsApp, agent events.
 */

import type { CustomActionDef } from "@miladyai/agent/contracts/config";
import { packageNameToAppRouteSlug } from "@miladyai/shared/contracts/apps";
import { MiladyClient } from "./client-base";
import type {
  AppLaunchResult,
  AppRunActionResult,
  AppRunSummary,
  AppSessionActionResult,
  AppSessionControlAction,
  AppSessionState,
  AppStopResult,
  BabylonActivityFeed,
  BabylonAgentGoal,
  BabylonAgentStats,
  BabylonAgentStatus,
  BabylonAgentSummary,
  BabylonChat,
  BabylonChatMessage,
  BabylonChatMessagesResponse,
  BabylonChatResponse,
  BabylonChatsResponse,
  BabylonLogEntry,
  BabylonPerpMarket,
  BabylonPerpPosition,
  BabylonPerpTradeResult,
  BabylonPostResult,
  BabylonPostsResponse,
  BabylonPredictionMarket,
  BabylonPredictionMarketsResponse,
  BabylonSendMessageResult,
  BabylonTeamChatInfo,
  BabylonTeamResponse,
  BabylonToggleResponse,
  BabylonTradeResult,
  BabylonWallet,
  CatalogSearchResult,
  CatalogSkill,
  InstalledAppInfo,
  InstalledPlugin,
  PluginInstallResult,
  PluginMutationResult,
  RegistryAppInfo,
  RegistryPlugin,
  RegistryPluginItem,
  SkillInfo,
  SkillMarketplaceResult,
  SkillScanReportSummary,
} from "./client-types";

export type AppRunSteeringDisposition =
  | "accepted"
  | "queued"
  | "rejected"
  | "unsupported";

export interface AppRunSteeringResult {
  success: boolean;
  message: string;
  disposition: AppRunSteeringDisposition;
  status: number;
  run?: AppRunSummary | null;
  session?: AppSessionState | null;
}

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    getSkills(): Promise<{ skills: SkillInfo[] }>;
    refreshSkills(): Promise<{ ok: boolean; skills: SkillInfo[] }>;
    getSkillCatalog(opts?: {
      page?: number;
      perPage?: number;
      sort?: string;
    }): Promise<{
      total: number;
      page: number;
      perPage: number;
      totalPages: number;
      skills: CatalogSkill[];
    }>;
    searchSkillCatalog(
      query: string,
      limit?: number,
    ): Promise<{
      query: string;
      count: number;
      results: CatalogSearchResult[];
    }>;
    getSkillCatalogDetail(slug: string): Promise<{ skill: CatalogSkill }>;
    refreshSkillCatalog(): Promise<{ ok: boolean; count: number }>;
    installCatalogSkill(
      slug: string,
      version?: string,
    ): Promise<{
      ok: boolean;
      slug: string;
      message: string;
      alreadyInstalled?: boolean;
    }>;
    uninstallCatalogSkill(slug: string): Promise<{
      ok: boolean;
      slug: string;
      message: string;
    }>;
    getRegistryPlugins(): Promise<{
      count: number;
      plugins: RegistryPlugin[];
    }>;
    getRegistryPluginInfo(name: string): Promise<{ plugin: RegistryPlugin }>;
    getInstalledPlugins(): Promise<{
      count: number;
      plugins: InstalledPlugin[];
    }>;
    installRegistryPlugin(
      name: string,
      autoRestart?: boolean,
      options?: { stream?: "latest" | "alpha"; version?: string },
    ): Promise<PluginInstallResult>;
    updateRegistryPlugin(
      name: string,
      autoRestart?: boolean,
      options?: { stream?: "latest" | "alpha"; version?: string },
    ): Promise<PluginInstallResult>;
    uninstallRegistryPlugin(
      name: string,
      autoRestart?: boolean,
    ): Promise<PluginMutationResult & { pluginName: string }>;
    searchSkillsMarketplace(
      query: string,
      installed: boolean,
      limit: number,
    ): Promise<{ results: SkillMarketplaceResult[] }>;
    getSkillsMarketplaceConfig(): Promise<{ keySet: boolean }>;
    updateSkillsMarketplaceConfig(apiKey: string): Promise<{ keySet: boolean }>;
    installMarketplaceSkill(data: {
      slug?: string;
      githubUrl?: string;
      repository?: string;
      path?: string;
      name?: string;
      description?: string;
      source: string;
      autoRefresh?: boolean;
    }): Promise<void>;
    uninstallMarketplaceSkill(
      skillId: string,
      autoRefresh: boolean,
    ): Promise<void>;
    updateSkill(
      skillId: string,
      enabled: boolean,
    ): Promise<{ skill: SkillInfo }>;
    createSkill(
      name: string,
      description: string,
    ): Promise<{ ok: boolean; skill: SkillInfo; path: string }>;
    openSkill(id: string): Promise<{ ok: boolean; path: string }>;
    getSkillSource(id: string): Promise<{
      ok: boolean;
      skillId: string;
      content: string;
      path: string;
    }>;
    saveSkillSource(
      id: string,
      content: string,
    ): Promise<{ ok: boolean; skillId: string; skill: SkillInfo }>;
    deleteSkill(
      id: string,
    ): Promise<{ ok: boolean; skillId: string; source: string }>;
    getSkillScanReport(id: string): Promise<{
      ok: boolean;
      report: SkillScanReportSummary | null;
      acknowledged: boolean;
      acknowledgment: {
        acknowledgedAt: string;
        findingCount: number;
      } | null;
    }>;
    acknowledgeSkill(
      id: string,
      enable: boolean,
    ): Promise<{
      ok: boolean;
      skillId: string;
      acknowledged: boolean;
      enabled: boolean;
      findingCount: number;
    }>;
    listApps(): Promise<RegistryAppInfo[]>;
    searchApps(query: string): Promise<RegistryAppInfo[]>;
    listInstalledApps(): Promise<InstalledAppInfo[]>;
    listAppRuns(): Promise<AppRunSummary[]>;
    getAppRun(runId: string): Promise<AppRunSummary>;
    attachAppRun(runId: string): Promise<AppRunActionResult>;
    detachAppRun(runId: string): Promise<AppRunActionResult>;
    stopApp(name: string): Promise<AppStopResult>;
    stopAppRun(runId: string): Promise<AppStopResult>;
    getAppInfo(name: string): Promise<RegistryAppInfo>;
    launchApp(name: string): Promise<AppLaunchResult>;
    sendAppRunMessage(
      runId: string,
      content: string,
    ): Promise<AppRunSteeringResult>;
    controlAppRun(
      runId: string,
      action: AppSessionControlAction,
    ): Promise<AppRunSteeringResult>;
    getAppSessionState(
      appName: string,
      sessionId: string,
    ): Promise<AppSessionState>;
    sendAppSessionMessage(
      appName: string,
      sessionId: string,
      content: string,
    ): Promise<AppSessionActionResult>;
    controlAppSession(
      appName: string,
      sessionId: string,
      action: AppSessionControlAction,
    ): Promise<AppSessionActionResult>;
    listRegistryPlugins(): Promise<RegistryPluginItem[]>;
    searchRegistryPlugins(query: string): Promise<RegistryPluginItem[]>;
    listCustomActions(): Promise<CustomActionDef[]>;
    createCustomAction(
      action: Omit<CustomActionDef, "id" | "createdAt" | "updatedAt">,
    ): Promise<CustomActionDef>;
    updateCustomAction(
      id: string,
      action: Partial<CustomActionDef>,
    ): Promise<CustomActionDef>;
    deleteCustomAction(id: string): Promise<void>;
    testCustomAction(
      id: string,
      params: Record<string, string>,
    ): Promise<{
      ok: boolean;
      output: string;
      error?: string;
      durationMs: number;
    }>;
    generateCustomAction(
      prompt: string,
    ): Promise<{ ok: boolean; generated: Record<string, unknown> }>;
    getWhatsAppStatus(accountId?: string): Promise<{
      accountId: string;
      status: string;
      authExists: boolean;
      serviceConnected: boolean;
      servicePhone: string | null;
    }>;
    startWhatsAppPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
      error?: string;
    }>;
    stopWhatsAppPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
    }>;
    disconnectWhatsApp(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
    }>;
    getSignalStatus(accountId?: string): Promise<{
      accountId: string;
      status: string;
      authExists: boolean;
      serviceConnected: boolean;
      qrDataUrl: string | null;
      phoneNumber: string | null;
      error: string | null;
    }>;
    startSignalPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
      error?: string;
    }>;
    stopSignalPairing(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
      status: string;
    }>;
    disconnectSignal(accountId?: string): Promise<{
      ok: boolean;
      accountId: string;
    }>;
    getTelegramAccountStatus(): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    startTelegramAccountAuth(phone?: string): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    submitTelegramAccountAuth(input: {
      provisioningCode?: string;
      telegramCode?: string;
      password?: string;
    }): Promise<{
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    disconnectTelegramAccount(): Promise<{
      ok: boolean;
      available: boolean;
      status: string;
      configured: boolean;
      sessionExists: boolean;
      serviceConnected: boolean;
      restartRequired: boolean;
      hasAppCredentials: boolean;
      phone: string | null;
      isCodeViaApp: boolean;
      account: {
        id: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
      } | null;
      error: string | null;
    }>;
    getDiscordLocalStatus(): Promise<{
      available: boolean;
      connected: boolean;
      authenticated: boolean;
      currentUser?: {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      } | null;
      subscribedChannelIds: string[];
      configuredChannelIds: string[];
      scopes: string[];
      lastError: string | null;
      ipcPath: string | null;
    }>;
    authorizeDiscordLocal(): Promise<{
      available: boolean;
      connected: boolean;
      authenticated: boolean;
      currentUser?: {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      } | null;
      subscribedChannelIds: string[];
      configuredChannelIds: string[];
      scopes: string[];
      lastError: string | null;
      ipcPath: string | null;
    }>;
    disconnectDiscordLocal(): Promise<{ ok: boolean }>;
    listDiscordLocalGuilds(): Promise<{
      guilds: Array<{ id: string; name: string }>;
      count: number;
    }>;
    listDiscordLocalChannels(guildId: string): Promise<{
      channels: Array<{
        id: string;
        guild_id?: string | null;
        type?: number;
        name?: string | null;
        recipients?: Array<{
          id: string;
          username: string;
          global_name?: string | null;
          avatar?: string | null;
        }>;
      }>;
      count: number;
    }>;
    saveDiscordLocalSubscriptions(channelIds: string[]): Promise<{
      subscribedChannelIds: string[];
    }>;
    getBlueBubblesStatus(): Promise<{
      available: boolean;
      connected: boolean;
      webhookPath: string;
      reason?: string;
    }>;

    // Babylon terminal methods
    getBabylonAgentStatus(): Promise<BabylonAgentStatus>;
    getBabylonAgentActivity(opts?: {
      limit?: number;
      type?: string;
    }): Promise<BabylonActivityFeed>;
    getBabylonAgentLogs(opts?: {
      type?: string;
      level?: string;
    }): Promise<BabylonLogEntry[]>;
    getBabylonAgentWallet(): Promise<BabylonWallet>;
    getBabylonTeam(): Promise<BabylonTeamResponse>;
    getBabylonTeamChat(): Promise<BabylonTeamChatInfo>;
    sendBabylonTeamChat(
      content: string,
      mentions?: string[],
    ): Promise<BabylonChatResponse>;
    toggleBabylonAgent(
      action: "pause" | "resume" | "toggle",
    ): Promise<BabylonToggleResponse>;
    toggleBabylonAgentAutonomy(opts: {
      trading?: boolean;
      posting?: boolean;
      commenting?: boolean;
      dms?: boolean;
    }): Promise<BabylonToggleResponse>;

    // Babylon markets
    getBabylonPredictionMarkets(opts?: {
      page?: number;
      pageSize?: number;
      status?: string;
      category?: string;
    }): Promise<BabylonPredictionMarketsResponse>;
    getBabylonPredictionMarket(
      marketId: string,
    ): Promise<BabylonPredictionMarket>;
    buyBabylonPredictionShares(
      marketId: string,
      side: "yes" | "no",
      amount: number,
    ): Promise<BabylonTradeResult>;
    sellBabylonPredictionShares(
      marketId: string,
      side: "yes" | "no",
      amount: number,
    ): Promise<BabylonTradeResult>;
    getBabylonPerpMarkets(): Promise<BabylonPerpMarket[]>;
    getBabylonOpenPerpPositions(): Promise<BabylonPerpPosition[]>;
    closeBabylonPerpPosition(
      positionId: string,
    ): Promise<BabylonPerpTradeResult>;

    // Babylon social
    getBabylonPosts(opts?: {
      page?: number;
      limit?: number;
      feed?: string;
    }): Promise<BabylonPostsResponse>;
    createBabylonPost(
      content: string,
      marketId?: string,
    ): Promise<BabylonPostResult>;
    commentOnBabylonPost(
      postId: string,
      content: string,
    ): Promise<BabylonPostResult>;
    likeBabylonPost(postId: string): Promise<{ ok: boolean }>;

    // Babylon messaging
    getBabylonChats(): Promise<BabylonChatsResponse>;
    getBabylonChatMessages(
      chatId: string,
    ): Promise<BabylonChatMessagesResponse>;
    sendBabylonChatMessage(
      chatId: string,
      content: string,
    ): Promise<BabylonSendMessageResult>;
    getBabylonDM(userId: string): Promise<BabylonChat>;

    // Babylon agent management
    getBabylonAgentGoals(): Promise<BabylonAgentGoal[]>;
    getBabylonAgentStats(): Promise<BabylonAgentStats>;
    getBabylonAgentSummary(): Promise<BabylonAgentSummary>;
    getBabylonAgentRecentTrades(): Promise<BabylonActivityFeed>;
    getBabylonAgentTradingBalance(): Promise<{ balance: number }>;
    sendBabylonAgentChat(content: string): Promise<BabylonChatResponse>;
    getBabylonAgentChat(): Promise<{ messages: BabylonChatMessage[] }>;

    // Babylon feed
    getBabylonFeedForYou(): Promise<BabylonPostsResponse>;
    getBabylonFeedHot(): Promise<BabylonPostsResponse>;
    getBabylonTrades(): Promise<BabylonActivityFeed>;

    // Babylon discover & team
    discoverBabylonAgents(): Promise<BabylonTeamResponse>;
    getBabylonTeamDashboard(): Promise<Record<string, unknown>>;
    getBabylonTeamConversations(): Promise<Record<string, unknown>>;
    pauseAllBabylonAgents(): Promise<{ ok: boolean }>;
    resumeAllBabylonAgents(): Promise<{ ok: boolean }>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

MiladyClient.prototype.getSkills = async function (this: MiladyClient) {
  return this.fetch("/api/skills");
};

MiladyClient.prototype.refreshSkills = async function (this: MiladyClient) {
  return this.fetch("/api/skills/refresh", { method: "POST" });
};

MiladyClient.prototype.getSkillCatalog = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.perPage) params.set("perPage", String(opts.perPage));
  if (opts?.sort) params.set("sort", opts.sort);
  const qs = params.toString();
  return this.fetch(`/api/skills/catalog${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.searchSkillCatalog = async function (
  this: MiladyClient,
  query,
  limit = 30,
) {
  return this.fetch(
    `/api/skills/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
};

MiladyClient.prototype.getSkillCatalogDetail = async function (
  this: MiladyClient,
  slug,
) {
  return this.fetch(`/api/skills/catalog/${encodeURIComponent(slug)}`);
};

MiladyClient.prototype.refreshSkillCatalog = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/skills/catalog/refresh", { method: "POST" });
};

MiladyClient.prototype.installCatalogSkill = async function (
  this: MiladyClient,
  slug,
  version?,
) {
  return this.fetch("/api/skills/catalog/install", {
    method: "POST",
    body: JSON.stringify({ slug, version }),
  });
};

MiladyClient.prototype.uninstallCatalogSkill = async function (
  this: MiladyClient,
  slug,
) {
  return this.fetch("/api/skills/catalog/uninstall", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
};

MiladyClient.prototype.getRegistryPlugins = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/registry/plugins");
};

MiladyClient.prototype.getRegistryPluginInfo = async function (
  this: MiladyClient,
  name,
) {
  return this.fetch(`/api/registry/plugins/${encodeURIComponent(name)}`);
};

MiladyClient.prototype.getInstalledPlugins = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/plugins/installed");
};

MiladyClient.prototype.installRegistryPlugin = async function (
  this: MiladyClient,
  name,
  autoRestart = true,
  options = {},
) {
  return this.fetch(
    "/api/plugins/install",
    {
      method: "POST",
      body: JSON.stringify({ name, autoRestart, ...options }),
    },
    { timeoutMs: 120_000 },
  );
};

MiladyClient.prototype.updateRegistryPlugin = async function (
  this: MiladyClient,
  name,
  autoRestart = true,
  options = {},
) {
  return this.fetch(
    "/api/plugins/update",
    {
      method: "POST",
      body: JSON.stringify({ name, autoRestart, ...options }),
    },
    { timeoutMs: 120_000 },
  );
};

MiladyClient.prototype.uninstallRegistryPlugin = async function (
  this: MiladyClient,
  name,
  autoRestart = true,
) {
  return this.fetch("/api/plugins/uninstall", {
    method: "POST",
    body: JSON.stringify({ name, autoRestart }),
  });
};

MiladyClient.prototype.searchSkillsMarketplace = async function (
  this: MiladyClient,
  query,
  installed,
  limit,
) {
  const params = new URLSearchParams({
    q: query,
    installed: String(installed),
    limit: String(limit),
  });
  return this.fetch(`/api/skills/marketplace/search?${params}`);
};

MiladyClient.prototype.getSkillsMarketplaceConfig = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/skills/marketplace/config");
};

MiladyClient.prototype.updateSkillsMarketplaceConfig = async function (
  this: MiladyClient,
  apiKey,
) {
  return this.fetch("/api/skills/marketplace/config", {
    method: "PUT",
    body: JSON.stringify({ apiKey }),
  });
};

MiladyClient.prototype.installMarketplaceSkill = async function (
  this: MiladyClient,
  data,
) {
  await this.fetch("/api/skills/marketplace/install", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.uninstallMarketplaceSkill = async function (
  this: MiladyClient,
  skillId,
  autoRefresh,
) {
  await this.fetch("/api/skills/marketplace/uninstall", {
    method: "POST",
    body: JSON.stringify({ id: skillId, autoRefresh }),
  });
};

MiladyClient.prototype.updateSkill = async function (
  this: MiladyClient,
  skillId,
  enabled,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(skillId)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
};

MiladyClient.prototype.createSkill = async function (
  this: MiladyClient,
  name,
  description,
) {
  return this.fetch("/api/skills/create", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
};

MiladyClient.prototype.openSkill = async function (this: MiladyClient, id) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/open`, {
    method: "POST",
  });
};

MiladyClient.prototype.getSkillSource = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`);
};

MiladyClient.prototype.saveSkillSource = async function (
  this: MiladyClient,
  id,
  content,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
};

MiladyClient.prototype.deleteSkill = async function (this: MiladyClient, id) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.getSkillScanReport = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/scan`);
};

MiladyClient.prototype.acknowledgeSkill = async function (
  this: MiladyClient,
  id,
  enable,
) {
  return this.fetch(`/api/skills/${encodeURIComponent(id)}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ enable }),
  });
};

MiladyClient.prototype.listApps = async function (this: MiladyClient) {
  return this.fetch("/api/apps");
};

MiladyClient.prototype.searchApps = async function (this: MiladyClient, query) {
  return this.fetch(`/api/apps/search?q=${encodeURIComponent(query)}`);
};

MiladyClient.prototype.listInstalledApps = async function (this: MiladyClient) {
  return this.fetch("/api/apps/installed");
};

MiladyClient.prototype.listAppRuns = async function (this: MiladyClient) {
  return this.fetch("/api/apps/runs");
};

MiladyClient.prototype.getAppRun = async function (this: MiladyClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}`);
};

MiladyClient.prototype.attachAppRun = async function (
  this: MiladyClient,
  runId,
) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/attach`, {
    method: "POST",
  });
};

MiladyClient.prototype.detachAppRun = async function (
  this: MiladyClient,
  runId,
) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/detach`, {
    method: "POST",
  });
};

MiladyClient.prototype.stopApp = async function (this: MiladyClient, name) {
  return this.fetch("/api/apps/stop", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
};

MiladyClient.prototype.stopAppRun = async function (this: MiladyClient, runId) {
  return this.fetch(`/api/apps/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
  });
};

MiladyClient.prototype.getAppInfo = async function (this: MiladyClient, name) {
  return this.fetch(`/api/apps/info/${encodeURIComponent(name)}`);
};

MiladyClient.prototype.launchApp = async function (this: MiladyClient, name) {
  return this.fetch("/api/apps/launch", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
};

MiladyClient.prototype.sendAppRunMessage = async function (
  this: MiladyClient,
  runId,
  content,
) {
  const response = await this.rawRequest(
    `/api/apps/runs/${encodeURIComponent(runId)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
    { allowNonOk: true },
  );
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    success: Boolean(data.success),
    message:
      typeof data.message === "string" && data.message.trim().length > 0
        ? data.message.trim()
        : response.status === 202
          ? "Command queued."
          : response.status >= 500
            ? "Command unavailable."
            : "Command rejected.",
    disposition:
      data.disposition === "accepted" ||
      data.disposition === "queued" ||
      data.disposition === "rejected" ||
      data.disposition === "unsupported"
        ? data.disposition
        : response.status === 202
          ? "queued"
          : response.status >= 500
            ? "unsupported"
            : response.status >= 400
              ? "rejected"
              : "accepted",
    status: response.status,
    run:
      data.run && typeof data.run === "object"
        ? (data.run as AppRunSummary)
        : null,
    session:
      data.session && typeof data.session === "object"
        ? (data.session as AppSessionState)
        : null,
  };
};

MiladyClient.prototype.controlAppRun = async function (
  this: MiladyClient,
  runId,
  action,
) {
  const response = await this.rawRequest(
    `/api/apps/runs/${encodeURIComponent(runId)}/control`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
    { allowNonOk: true },
  );
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return {
    success: Boolean(data.success),
    message:
      typeof data.message === "string" && data.message.trim().length > 0
        ? data.message.trim()
        : response.status === 202
          ? "Command queued."
          : response.status >= 500
            ? "Command unavailable."
            : "Command rejected.",
    disposition:
      data.disposition === "accepted" ||
      data.disposition === "queued" ||
      data.disposition === "rejected" ||
      data.disposition === "unsupported"
        ? data.disposition
        : response.status === 202
          ? "queued"
          : response.status >= 500
            ? "unsupported"
            : response.status >= 400
              ? "rejected"
              : "accepted",
    status: response.status,
    run:
      data.run && typeof data.run === "object"
        ? (data.run as AppRunSummary)
        : null,
    session:
      data.session && typeof data.session === "object"
        ? (data.session as AppSessionState)
        : null,
  };
};

MiladyClient.prototype.getAppSessionState = async function (
  this: MiladyClient,
  appName,
  sessionId,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}`,
  );
};

MiladyClient.prototype.sendAppSessionMessage = async function (
  this: MiladyClient,
  appName,
  sessionId,
  content,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
};

MiladyClient.prototype.controlAppSession = async function (
  this: MiladyClient,
  appName,
  sessionId,
  action,
) {
  const routeSlug = packageNameToAppRouteSlug(appName) ?? appName;
  return this.fetch(
    `/api/apps/${encodeURIComponent(routeSlug)}/session/${encodeURIComponent(sessionId)}/control`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );
};

MiladyClient.prototype.listRegistryPlugins = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/plugins");
};

MiladyClient.prototype.searchRegistryPlugins = async function (
  this: MiladyClient,
  query,
) {
  return this.fetch(`/api/apps/plugins/search?q=${encodeURIComponent(query)}`);
};

MiladyClient.prototype.listCustomActions = async function (this: MiladyClient) {
  const data = await this.fetch<{ actions: CustomActionDef[] }>(
    "/api/custom-actions",
  );
  return data.actions;
};

MiladyClient.prototype.createCustomAction = async function (
  this: MiladyClient,
  action,
) {
  const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
    "/api/custom-actions",
    { method: "POST", body: JSON.stringify(action) },
  );
  return data.action;
};

MiladyClient.prototype.updateCustomAction = async function (
  this: MiladyClient,
  id,
  action,
) {
  const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
    `/api/custom-actions/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(action) },
  );
  return data.action;
};

MiladyClient.prototype.deleteCustomAction = async function (
  this: MiladyClient,
  id,
) {
  await this.fetch(`/api/custom-actions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.testCustomAction = async function (
  this: MiladyClient,
  id,
  params,
) {
  return this.fetch(`/api/custom-actions/${encodeURIComponent(id)}/test`, {
    method: "POST",
    body: JSON.stringify({ params }),
  });
};

MiladyClient.prototype.generateCustomAction = async function (
  this: MiladyClient,
  prompt,
) {
  return this.fetch("/api/custom-actions/generate", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
};

MiladyClient.prototype.getWhatsAppStatus = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch(
    `/api/whatsapp/status?accountId=${encodeURIComponent(accountId)}`,
  );
};

MiladyClient.prototype.startWhatsAppPairing = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/pair", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.stopWhatsAppPairing = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/pair/stop", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.disconnectWhatsApp = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/whatsapp/disconnect", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.getSignalStatus = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch(
    `/api/signal/status?accountId=${encodeURIComponent(accountId)}`,
  );
};

MiladyClient.prototype.startSignalPairing = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/signal/pair", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.stopSignalPairing = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/signal/pair/stop", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.disconnectSignal = async function (
  this: MiladyClient,
  accountId = "default",
) {
  return this.fetch("/api/signal/disconnect", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
};

MiladyClient.prototype.getTelegramAccountStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/telegram-account/status");
};

MiladyClient.prototype.startTelegramAccountAuth = async function (
  this: MiladyClient,
  phone,
) {
  return this.fetch("/api/telegram-account/auth/start", {
    method: "POST",
    body: JSON.stringify(
      typeof phone === "string" && phone.trim().length > 0
        ? { phone: phone.trim() }
        : {},
    ),
  });
};

MiladyClient.prototype.submitTelegramAccountAuth = async function (
  this: MiladyClient,
  input,
) {
  return this.fetch("/api/telegram-account/auth/submit", {
    method: "POST",
    body: JSON.stringify(input),
  });
};

MiladyClient.prototype.disconnectTelegramAccount = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/telegram-account/disconnect", {
    method: "POST",
  });
};

MiladyClient.prototype.getDiscordLocalStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/discord-local/status");
};

MiladyClient.prototype.authorizeDiscordLocal = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/discord-local/authorize", {
    method: "POST",
  });
};

MiladyClient.prototype.disconnectDiscordLocal = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/discord-local/disconnect", {
    method: "POST",
  });
};

MiladyClient.prototype.listDiscordLocalGuilds = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/discord-local/guilds");
};

MiladyClient.prototype.listDiscordLocalChannels = async function (
  this: MiladyClient,
  guildId,
) {
  return this.fetch(
    `/api/discord-local/channels?guildId=${encodeURIComponent(guildId)}`,
  );
};

MiladyClient.prototype.saveDiscordLocalSubscriptions = async function (
  this: MiladyClient,
  channelIds,
) {
  return this.fetch("/api/discord-local/subscriptions", {
    method: "POST",
    body: JSON.stringify({ channelIds }),
  });
};

MiladyClient.prototype.getBlueBubblesStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/bluebubbles/status");
};

// ---------------------------------------------------------------------------
// Babylon terminal methods
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonAgentStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/status");
};

MiladyClient.prototype.getBabylonAgentActivity = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.type) params.set("type", opts.type);
  const qs = params.toString();
  return this.fetch(`/api/apps/babylon/agent/activity${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getBabylonAgentLogs = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.level) params.set("level", opts.level);
  const qs = params.toString();
  return this.fetch(`/api/apps/babylon/agent/logs${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getBabylonAgentWallet = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/wallet");
};

MiladyClient.prototype.getBabylonTeam = async function (this: MiladyClient) {
  return this.fetch("/api/apps/babylon/team");
};

MiladyClient.prototype.getBabylonTeamChat = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/team/info");
};

MiladyClient.prototype.sendBabylonTeamChat = async function (
  this: MiladyClient,
  content,
  mentions?,
) {
  return this.fetch("/api/apps/babylon/team/chat", {
    method: "POST",
    body: JSON.stringify({ content, mentions }),
  });
};

MiladyClient.prototype.toggleBabylonAgent = async function (
  this: MiladyClient,
  action,
) {
  return this.fetch("/api/apps/babylon/agent/toggle", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
};

MiladyClient.prototype.toggleBabylonAgentAutonomy = async function (
  this: MiladyClient,
  opts,
) {
  return this.fetch("/api/apps/babylon/agent/autonomy", {
    method: "POST",
    body: JSON.stringify(opts),
  });
};

// ---------------------------------------------------------------------------
// Babylon markets
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonPredictionMarkets = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.pageSize) params.set("pageSize", String(opts.pageSize));
  if (opts?.status) params.set("status", opts.status);
  if (opts?.category) params.set("category", opts.category);
  const qs = params.toString();
  return this.fetch(
    `/api/apps/babylon/markets/predictions${qs ? `?${qs}` : ""}`,
  );
};

MiladyClient.prototype.getBabylonPredictionMarket = async function (
  this: MiladyClient,
  marketId,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}`,
  );
};

MiladyClient.prototype.buyBabylonPredictionShares = async function (
  this: MiladyClient,
  marketId,
  side,
  amount,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}/buy`,
    { method: "POST", body: JSON.stringify({ side, amount }) },
  );
};

MiladyClient.prototype.sellBabylonPredictionShares = async function (
  this: MiladyClient,
  marketId,
  side,
  amount,
) {
  return this.fetch(
    `/api/apps/babylon/markets/predictions/${encodeURIComponent(marketId)}/sell`,
    { method: "POST", body: JSON.stringify({ side, amount }) },
  );
};

MiladyClient.prototype.getBabylonPerpMarkets = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/markets/perps");
};

MiladyClient.prototype.getBabylonOpenPerpPositions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/markets/perps/open");
};

MiladyClient.prototype.closeBabylonPerpPosition = async function (
  this: MiladyClient,
  positionId,
) {
  return this.fetch(
    `/api/apps/babylon/markets/perps/position/${encodeURIComponent(positionId)}/close`,
    { method: "POST", body: JSON.stringify({}) },
  );
};

// ---------------------------------------------------------------------------
// Babylon social
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonPosts = async function (
  this: MiladyClient,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.feed) params.set("feed", opts.feed);
  const qs = params.toString();
  return this.fetch(`/api/apps/babylon/posts${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.createBabylonPost = async function (
  this: MiladyClient,
  content,
  marketId?,
) {
  return this.fetch("/api/apps/babylon/posts", {
    method: "POST",
    body: JSON.stringify({ content, marketId }),
  });
};

MiladyClient.prototype.commentOnBabylonPost = async function (
  this: MiladyClient,
  postId,
  content,
) {
  return this.fetch(
    `/api/apps/babylon/posts/${encodeURIComponent(postId)}/comments`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
};

MiladyClient.prototype.likeBabylonPost = async function (
  this: MiladyClient,
  postId,
) {
  return this.fetch(
    `/api/apps/babylon/posts/${encodeURIComponent(postId)}/like`,
    { method: "POST" },
  );
};

// ---------------------------------------------------------------------------
// Babylon messaging
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonChats = async function (this: MiladyClient) {
  return this.fetch("/api/apps/babylon/chats");
};

MiladyClient.prototype.getBabylonChatMessages = async function (
  this: MiladyClient,
  chatId,
) {
  return this.fetch(
    `/api/apps/babylon/chats/${encodeURIComponent(chatId)}/messages`,
  );
};

MiladyClient.prototype.sendBabylonChatMessage = async function (
  this: MiladyClient,
  chatId,
  content,
) {
  return this.fetch(
    `/api/apps/babylon/chats/${encodeURIComponent(chatId)}/message`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
};

MiladyClient.prototype.getBabylonDM = async function (
  this: MiladyClient,
  userId,
) {
  return this.fetch(
    `/api/apps/babylon/chats/dm?userId=${encodeURIComponent(userId)}`,
  );
};

// ---------------------------------------------------------------------------
// Babylon agent management
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonAgentGoals = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/goals");
};

MiladyClient.prototype.getBabylonAgentStats = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/stats");
};

MiladyClient.prototype.getBabylonAgentSummary = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/summary");
};

MiladyClient.prototype.getBabylonAgentRecentTrades = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/recent-trades");
};

MiladyClient.prototype.getBabylonAgentTradingBalance = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/trading-balance");
};

MiladyClient.prototype.sendBabylonAgentChat = async function (
  this: MiladyClient,
  content,
) {
  return this.fetch("/api/apps/babylon/agent/chat", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
};

MiladyClient.prototype.getBabylonAgentChat = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agent/chat");
};

// ---------------------------------------------------------------------------
// Babylon feed
// ---------------------------------------------------------------------------

MiladyClient.prototype.getBabylonFeedForYou = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/feed/for-you");
};

MiladyClient.prototype.getBabylonFeedHot = async function (this: MiladyClient) {
  return this.fetch("/api/apps/babylon/feed/hot");
};

MiladyClient.prototype.getBabylonTrades = async function (this: MiladyClient) {
  return this.fetch("/api/apps/babylon/trades");
};

// ---------------------------------------------------------------------------
// Babylon discover & team management
// ---------------------------------------------------------------------------

MiladyClient.prototype.discoverBabylonAgents = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/agents/discover");
};

MiladyClient.prototype.getBabylonTeamDashboard = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/team/dashboard");
};

MiladyClient.prototype.getBabylonTeamConversations = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/team/conversations");
};

MiladyClient.prototype.pauseAllBabylonAgents = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/admin/agents/pause-all", {
    method: "POST",
  });
};

MiladyClient.prototype.resumeAllBabylonAgents = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/babylon/admin/agents/resume-all", {
    method: "POST",
  });
};
