/**
 * Skills domain methods — skills, catalog, marketplace, apps, Hyperscape,
 * custom actions, WhatsApp, agent events.
 */

import type { CustomActionDef } from "@miladyai/agent/contracts/config";
import { MiladyClient } from "./client-base";
import type {
  AppLaunchResult,
  AppStopResult,
  CatalogSearchResult,
  CatalogSkill,
  HyperscapeActionResponse,
  HyperscapeAgentGoalResponse,
  HyperscapeEmbeddedAgentControlAction,
  HyperscapeEmbeddedAgentMutationResponse,
  HyperscapeEmbeddedAgentsResponse,
  HyperscapeJsonValue,
  HyperscapeQuickActionsResponse,
  HyperscapeScriptedRole,
  InstalledAppInfo,
  InstalledPlugin,
  PluginInstallResult,
  RegistryAppInfo,
  RegistryPlugin,
  RegistryPluginItem,
  SkillInfo,
  SkillMarketplaceResult,
  SkillScanReportSummary,
} from "./client-types";

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
    ): Promise<PluginInstallResult>;
    uninstallRegistryPlugin(
      name: string,
      autoRestart?: boolean,
    ): Promise<{
      ok: boolean;
      pluginName: string;
      message: string;
      error?: string;
    }>;
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
    stopApp(name: string): Promise<AppStopResult>;
    getAppInfo(name: string): Promise<RegistryAppInfo>;
    launchApp(name: string): Promise<AppLaunchResult>;
    listRegistryPlugins(): Promise<RegistryPluginItem[]>;
    searchRegistryPlugins(query: string): Promise<RegistryPluginItem[]>;
    listHyperscapeEmbeddedAgents(): Promise<HyperscapeEmbeddedAgentsResponse>;
    createHyperscapeEmbeddedAgent(input: {
      characterId: string;
      autoStart?: boolean;
      scriptedRole?: HyperscapeScriptedRole;
    }): Promise<HyperscapeEmbeddedAgentMutationResponse>;
    controlHyperscapeEmbeddedAgent(
      characterId: string,
      action: HyperscapeEmbeddedAgentControlAction,
    ): Promise<HyperscapeEmbeddedAgentMutationResponse>;
    sendHyperscapeEmbeddedAgentCommand(
      characterId: string,
      command: string,
      data?: { [key: string]: HyperscapeJsonValue },
    ): Promise<HyperscapeActionResponse>;
    sendHyperscapeAgentMessage(
      agentId: string,
      content: string,
    ): Promise<HyperscapeActionResponse>;
    getHyperscapeAgentGoal(
      agentId: string,
    ): Promise<HyperscapeAgentGoalResponse>;
    getHyperscapeAgentQuickActions(
      agentId: string,
    ): Promise<HyperscapeQuickActionsResponse>;
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
) {
  return this.fetch(
    "/api/plugins/install",
    {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
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

MiladyClient.prototype.stopApp = async function (this: MiladyClient, name) {
  return this.fetch("/api/apps/stop", {
    method: "POST",
    body: JSON.stringify({ name }),
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

MiladyClient.prototype.listHyperscapeEmbeddedAgents = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/apps/hyperscape/embedded-agents");
};

MiladyClient.prototype.createHyperscapeEmbeddedAgent = async function (
  this: MiladyClient,
  input,
) {
  return this.fetch("/api/apps/hyperscape/embedded-agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
};

MiladyClient.prototype.controlHyperscapeEmbeddedAgent = async function (
  this: MiladyClient,
  characterId,
  action,
) {
  return this.fetch(
    `/api/apps/hyperscape/embedded-agents/${encodeURIComponent(characterId)}/${action}`,
    { method: "POST" },
  );
};

MiladyClient.prototype.sendHyperscapeEmbeddedAgentCommand = async function (
  this: MiladyClient,
  characterId,
  command,
  data?,
) {
  return this.fetch(
    `/api/apps/hyperscape/embedded-agents/${encodeURIComponent(characterId)}/command`,
    {
      method: "POST",
      body: JSON.stringify({ command, data }),
    },
  );
};

MiladyClient.prototype.sendHyperscapeAgentMessage = async function (
  this: MiladyClient,
  agentId,
  content,
) {
  return this.fetch(
    `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/message`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
};

MiladyClient.prototype.getHyperscapeAgentGoal = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/goal`,
  );
};

MiladyClient.prototype.getHyperscapeAgentQuickActions = async function (
  this: MiladyClient,
  agentId,
) {
  return this.fetch(
    `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/quick-actions`,
  );
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
