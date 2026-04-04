import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import {
  isMiladySettingsDebugEnabled,
  sanitizeForSettingsDebug,
  settingsDebugCloudSummary,
} from "@miladyai/shared";
import type { ElizaConfig } from "../config/config.js";
import { loadElizaConfig, saveElizaConfig } from "../config/config.js";
import {
  CORE_PLUGINS,
  OPTIONAL_CORE_PLUGINS,
} from "../runtime/core-plugins.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import type {
  CoreManagerLike,
  InstallProgressLike,
  PluginManagerLike,
} from "../services/plugin-manager-types.js";
import { type PluginParamInfo, validatePluginConfig } from "./plugin-validation.js";
import type { ReadJsonBodyOptions } from "./http-helpers.js";

// ---------------------------------------------------------------------------
// Types — kept lean to avoid circular deps with server.ts
// ---------------------------------------------------------------------------

interface PluginParamDef {
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

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category:
    | "ai-provider"
    | "connector"
    | "streaming"
    | "database"
    | "app"
    | "feature";
  source: "bundled" | "store";
  configKeys: string[];
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
  isActive?: boolean;
  loadError?: string;
  configUiHints?: Record<string, Record<string, unknown>>;
  icon?: string | null;
  homepage?: string;
  repository?: string;
  setupGuideUrl?: string;
  autoEnabled?: boolean;
  managementMode?: "standard" | "core-optional";
  capabilityStatus?:
    | "loaded"
    | "auto-enabled"
    | "blocked"
    | "missing-prerequisites"
    | "disabled";
  capabilityReason?: string | null;
  prerequisites?: Array<{ label: string; met: boolean }>;
}

interface SecretEntry {
  key: string;
  description: string;
  category: string;
  sensitive: boolean;
  required: boolean;
  isSet: boolean;
  maskedValue: string | null;
  usedBy: Array<{ pluginId: string; pluginName: string; enabled: boolean }>;
}

export interface PluginRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  state: {
    runtime: AgentRuntime | null;
    config: ElizaConfig;
    plugins: PluginEntry[];
    broadcastWs: ((data: Record<string, unknown>) => void) | null;
  };
  // Helpers from server.ts
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  scheduleRuntimeRestart: (reason: string) => void;
  // Server.ts internal helpers
  BLOCKED_ENV_KEYS: Set<string>;
  discoverInstalledPlugins: (config: ElizaConfig, bundledIds: Set<string>) => PluginEntry[];
  maskValue: (value: string) => string;
  aggregateSecrets: (plugins: PluginEntry[]) => SecretEntry[];
  readProviderCache: (providerId: string) => { models: Array<{ id: string; name: string; category: string }> } | null;
  paramKeyToCategory: (paramKey: string) => string;
  buildPluginEvmDiagnosticEntry: (opts: { config: ElizaConfig; runtime: AgentRuntime | null }) => PluginEntry;
  EVM_PLUGIN_PACKAGE: string;
  applyWhatsAppQrOverride: (plugins: PluginEntry[], workspaceDir: string) => void;
  applySignalQrOverride: (
    plugins: PluginEntry[],
    workspaceDir: string,
    signalAuthExists: (dir: string) => boolean,
  ) => void;
  signalAuthExists: (dir: string) => boolean;
  resolvePluginConfigMutationRejections: (
    parameters: PluginParamDef[],
    configObj: Record<string, string>,
  ) => Array<{ field: string; message: string }>;
  requirePluginManager: (runtime: AgentRuntime | null) => PluginManagerLike;
  requireCoreManager: (runtime: AgentRuntime | null) => CoreManagerLike;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle plugin management routes (/api/plugins/*, /api/secrets, /api/core/*).
 * Returns `true` if the request was handled.
 */
export async function handlePluginRoutes(
  ctx: PluginRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    state,
    json,
    error,
    readJsonBody,
    scheduleRuntimeRestart,
    BLOCKED_ENV_KEYS,
    discoverInstalledPlugins,
    maskValue,
    aggregateSecrets,
    readProviderCache,
    paramKeyToCategory,
    buildPluginEvmDiagnosticEntry,
    EVM_PLUGIN_PACKAGE,
    applyWhatsAppQrOverride,
    applySignalQrOverride,
    signalAuthExists,
    resolvePluginConfigMutationRejections,
    requirePluginManager,
    requireCoreManager,
  } = ctx;

  // ── GET /api/plugins ────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins") {
    // Re-read config from disk so we pick up plugins installed since server start.
    let freshConfig: ElizaConfig;
    try {
      freshConfig = loadElizaConfig();
    } catch {
      freshConfig = state.config;
    }

    // Merge user-installed plugins into the list (they don't exist in plugins.json)
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(freshConfig, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];
    const evmDiagnostic = buildPluginEvmDiagnosticEntry({
      config: state.config,
      runtime: state.runtime,
    });
    const existingEvmPlugin = allPlugins.find(
      (plugin) => plugin.id === "evm" || plugin.npmName === EVM_PLUGIN_PACKAGE,
    );
    if (existingEvmPlugin) {
      existingEvmPlugin.autoEnabled = evmDiagnostic.autoEnabled;
      existingEvmPlugin.managementMode = "core-optional";
      existingEvmPlugin.capabilityStatus = evmDiagnostic.capabilityStatus;
      existingEvmPlugin.capabilityReason = evmDiagnostic.capabilityReason;
      existingEvmPlugin.prerequisites = evmDiagnostic.prerequisites;
      existingEvmPlugin.setupGuideUrl =
        existingEvmPlugin.setupGuideUrl ?? evmDiagnostic.setupGuideUrl;
      existingEvmPlugin.tags = Array.from(
        new Set([...(existingEvmPlugin.tags ?? []), ...evmDiagnostic.tags]),
      );
    } else {
      allPlugins.push(evmDiagnostic);
    }

    // Resolve enabled state from config and loaded state from runtime.
    // "enabled" = user wants it active (config). "isActive" = actually loaded.
    const configEntries = (
      freshConfig.plugins as Record<string, unknown> | undefined
    )?.entries as Record<string, { enabled?: boolean }> | undefined;
    const loadedNames = state.runtime
      ? state.runtime.plugins.map((p) => p.name)
      : [];
    for (const plugin of allPlugins) {
      const suffix = `plugin-${plugin.id}`;
      const packageName = `@elizaos/plugin-${plugin.id}`;
      const npmPkgName = plugin.npmName;
      const isLoaded =
        loadedNames.length > 0 &&
        loadedNames.some((name) => {
          return (
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            (npmPkgName != null && name === npmPkgName) ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id)
          );
        });
      plugin.isActive = isLoaded;
      // Set enabled from config if available, otherwise from runtime
      const configEntry = configEntries?.[plugin.id];
      if (configEntry && typeof configEntry.enabled === "boolean") {
        plugin.enabled = configEntry.enabled;
      } else {
        plugin.enabled = isLoaded;
      }
      // Detect installed-but-failed-to-load plugins
      plugin.loadError = undefined;
      if (plugin.enabled && !isLoaded && state.runtime) {
        const installs = freshConfig.plugins?.installs as
          | Record<string, unknown>
          | undefined;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        const hasInstallRecord =
          installs?.[packageName] || installs?.[plugin.id];
        if (hasInstallRecord) {
          plugin.loadError =
            "Plugin installed but failed to load — the package may be missing compiled files.";
        }
      }
      if (plugin.id === "evm" || plugin.npmName === EVM_PLUGIN_PACKAGE) {
        plugin.enabled = evmDiagnostic.enabled;
        plugin.isActive = evmDiagnostic.isActive;
        plugin.autoEnabled = evmDiagnostic.autoEnabled;
        plugin.managementMode = "core-optional";
        plugin.capabilityStatus = evmDiagnostic.capabilityStatus;
        plugin.capabilityReason = evmDiagnostic.capabilityReason;
        plugin.prerequisites = evmDiagnostic.prerequisites;
      }
    }

    // Always refresh current env values and re-validate
    for (const plugin of allPlugins) {
      for (const param of plugin.parameters) {
        const envValue = process.env[param.key];
        param.isSet = Boolean(envValue?.trim());
        param.currentValue = param.isSet
          ? param.sensitive
            ? maskValue(envValue ?? "")
            : (envValue ?? "")
          : null;
      }
      const paramInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
        key: p.key,
        required: p.required,
        sensitive: p.sensitive,
        type: p.type,
        description: p.description,
        default: p.default,
      }));
      const validation = validatePluginConfig(
        plugin.id,
        plugin.category,
        plugin.envKey,
        plugin.configKeys,
        undefined,
        paramInfos,
      );
      plugin.validationErrors = validation.errors;
      plugin.validationWarnings = validation.warnings;
    }

    applyWhatsAppQrOverride(allPlugins, resolveDefaultAgentWorkspaceDir());
    applySignalQrOverride(
      allPlugins,
      resolveDefaultAgentWorkspaceDir(),
      signalAuthExists,
    );

    // Inject per-provider model options into configUiHints for MODEL fields.
    // Each provider's cache is independent — no cross-population.
    // Always set type: "select" on MODEL fields so they render as dropdowns,
    // even when no models are cached yet (empty dropdown prompts user to fetch).
    for (const plugin of allPlugins) {
      const providerModels = readProviderCache(plugin.id)?.models ?? [];

      for (const param of plugin.parameters) {
        if (!param.key.toUpperCase().includes("MODEL")) continue;

        // Filter to the category this field expects (chat, embedding, image, etc.)
        const expectedCat = paramKeyToCategory(param.key);
        const filtered = providerModels.filter(
          (m) => m.category === expectedCat,
        );

        if (!plugin.configUiHints) plugin.configUiHints = {};
        plugin.configUiHints[param.key] = {
          ...plugin.configUiHints[param.key],
          type: "select",
          options: filtered.map((m) => ({
            value: m.id,
            label: m.name !== m.id ? `${m.name} (${m.id})` : m.id,
          })),
        };
      }
    }

    json(res, { plugins: allPlugins });
    return true;
  }

  // ── PUT /api/plugins/:id ────────────────────────────────────────────────
  if (method === "PUT" && pathname.startsWith("/api/plugins/")) {
    const pluginId = pathname.slice("/api/plugins/".length);
    const body = await readJsonBody<{
      enabled?: boolean;
      config?: Record<string, string>;
    }>(req, res);
    if (!body) return true;

    if (isMiladySettingsDebugEnabled()) {
      logger.debug(
        `[milady][settings][api] PUT /api/plugins/${pluginId} body=${JSON.stringify(
          sanitizeForSettingsDebug({
            enabled: body.enabled,
            configKeys: body.config ? Object.keys(body.config).sort() : [],
            config: body.config ?? {},
          }),
        )}`,
      );
    }

    // Search both bundled plugins AND store-installed plugins
    let plugin = state.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      // Check store-installed plugins from config
      let freshCfg: ElizaConfig;
      try {
        freshCfg = loadElizaConfig();
      } catch {
        freshCfg = state.config;
      }
      const bundledIds = new Set(state.plugins.map((p) => p.id));
      const installed = discoverInstalledPlugins(freshCfg, bundledIds);
      const found = installed.find((p) => p.id === pluginId);
      if (found) {
        // Temporarily add to state.plugins so toggle logic works the same way
        state.plugins.push(found);
        plugin = found;
      }
    }
    if (!plugin) {
      error(res, `Plugin "${pluginId}" not found`, 404);
      return true;
    }

    if (body.enabled !== undefined) {
      plugin.enabled = body.enabled;
    }
    if (body.config) {
      const configRejections = resolvePluginConfigMutationRejections(
        plugin.parameters,
        body.config,
      );
      if (configRejections.length > 0) {
        json(
          res,
          { ok: false, plugin, validationErrors: configRejections },
          422,
        );
        return true;
      }

      // Only validate the fields actually being submitted — not all required
      // fields. Users may save partial config (e.g. just the API key) from
      // the Settings page; blocking the save because OTHER required fields
      // aren't set yet is counterproductive.
      const configObj = body.config;
      const submittedParamInfos: PluginParamInfo[] = plugin.parameters
        .filter((p) => p.key in configObj)
        .map((p) => ({
          key: p.key,
          required: p.required,
          sensitive: p.sensitive,
          type: p.type,
          description: p.description,
          default: p.default,
        }));
      const configValidation = validatePluginConfig(
        pluginId,
        plugin.category,
        plugin.envKey,
        plugin.configKeys,
        body.config,
        submittedParamInfos,
      );

      if (!configValidation.valid) {
        json(
          res,
          { ok: false, plugin, validationErrors: configValidation.errors },
          422,
        );
        return true;
      }

      const allowedParamKeys = new Set(plugin.parameters.map((p) => p.key));

      // Persist config values to state.config.env so they survive restarts
      if (!state.config.env) {
        state.config.env = {};
      }
      for (const [key, value] of Object.entries(body.config)) {
        if (
          allowedParamKeys.has(key) &&
          !BLOCKED_ENV_KEYS.has(key.toUpperCase()) &&
          typeof value === "string" &&
          value.trim()
        ) {
          process.env[key] = value;
          (state.config.env as Record<string, unknown>)[key] = value;
        }
      }
      plugin.configured = true;

      // Save config even when only config values changed (no enable toggle)
      if (body.enabled === undefined) {
        try {
          saveElizaConfig(state.config);
        } catch (err) {
          logger.warn(
            `[eliza-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    // Refresh validation
    const refreshParamInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
      key: p.key,
      required: p.required,
      sensitive: p.sensitive,
      type: p.type,
      description: p.description,
      default: p.default,
    }));
    const updated = validatePluginConfig(
      pluginId,
      plugin.category,
      plugin.envKey,
      plugin.configKeys,
      undefined,
      refreshParamInfos,
    );
    plugin.validationErrors = updated.errors;
    plugin.validationWarnings = updated.warnings;

    // Update config.plugins.entries so the runtime loads/skips this plugin
    if (body.enabled !== undefined) {
      const packageName = `@elizaos/plugin-${pluginId}`;

      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.entries) {
        (state.config.plugins as Record<string, unknown>).entries = {};
      }

      const entries = (state.config.plugins as Record<string, unknown>)
        .entries as Record<string, Record<string, unknown>>;
      entries[pluginId] = { enabled: body.enabled };
      logger.info(
        `[eliza-api] ${body.enabled ? "Enabled" : "Disabled"} plugin: ${packageName}`,
      );

      // Persist capability toggle state in config.features so the runtime
      // can gate related behaviour (e.g. disabling image description when
      // vision is toggled off).
      const CAPABILITY_FEATURE_IDS = new Set([
        "vision",
        "browser",
        "computeruse",
        "coding-agent",
      ]);
      if (CAPABILITY_FEATURE_IDS.has(pluginId)) {
        if (!state.config.features) {
          state.config.features = {};
        }
        state.config.features[pluginId] = body.enabled;
      }

      // Save updated config
      try {
        saveElizaConfig(state.config);
      } catch (err) {
        logger.warn(
          `[eliza-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
        );
      }

      scheduleRuntimeRestart(`Plugin toggle: ${pluginId}`);
    }

    if (isMiladySettingsDebugEnabled()) {
      const cloud = (state.config as Record<string, unknown>).cloud as
        | Record<string, unknown>
        | undefined;
      logger.debug(
        `[milady][settings][api] PUT /api/plugins/${pluginId} → done configured=${plugin.configured} enabled=${plugin.enabled} cloud=${JSON.stringify(settingsDebugCloudSummary(cloud))}`,
      );
    }

    json(res, { ok: true, plugin });
    return true;
  }

  // ── GET /api/secrets ─────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/secrets") {
    // Merge bundled + installed plugins for full parameter coverage
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(state.config, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];

    // Sync enabled status from runtime (same logic as GET /api/plugins)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of allPlugins) {
        const suffix = `plugin-${plugin.id}`;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        plugin.enabled = loadedNames.some(
          (name) =>
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id),
        );
      }
    }

    const secrets = aggregateSecrets(allPlugins);
    json(res, { secrets });
    return true;
  }

  // ── PUT /api/secrets ─────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/secrets") {
    const body = await readJsonBody<{ secrets: Record<string, string> }>(
      req,
      res,
    );
    if (!body) return true;
    if (!body.secrets || typeof body.secrets !== "object") {
      error(res, "Missing or invalid 'secrets' object", 400);
      return true;
    }

    // Build allowlist from all plugin-declared sensitive params
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(state.config, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];
    const allowedKeys = new Set<string>();
    for (const plugin of allPlugins) {
      for (const param of plugin.parameters) {
        if (param.sensitive) allowedKeys.add(param.key);
      }
    }

    const updatedKeys: string[] = [];
    for (const [key, value] of Object.entries(body.secrets)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (!allowedKeys.has(key)) continue;
      if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) continue;
      process.env[key] = value;
      updatedKeys.push(key);
    }

    // Mark affected plugins as configured
    for (const plugin of allPlugins) {
      const pluginKeys = new Set(plugin.parameters.map((p) => p.key));
      if (updatedKeys.some((k) => pluginKeys.has(k))) {
        plugin.configured = true;
      }
    }

    json(res, { ok: true, updated: updatedKeys });
    return true;
  }

  // ── POST /api/plugins/:id/test ────────────────────────────────────────
  // Test a plugin's connection / configuration validity.
  const pluginTestMatch =
    method === "POST" && pathname.match(/^\/api\/plugins\/([^/]+)\/test$/);
  if (pluginTestMatch) {
    const pluginId = decodeURIComponent(pluginTestMatch[1]);
    const startMs = Date.now();

    try {
      // Find the plugin in the runtime
      const allPlugins = state.runtime?.plugins ?? [];
      const normalizePluginId = (value: string): string =>
        value.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");

      const normalizedPluginId = normalizePluginId(pluginId);

      const plugin = allPlugins.find((p: { id?: string; name?: string }) => {
        const runtimeName = p.name ?? "";
        const runtimeId = normalizePluginId(runtimeName);
        return (
          p.id === pluginId ||
          p.name === pluginId ||
          runtimeId === pluginId ||
          runtimeId === normalizedPluginId
        );
      });

      if (!plugin) {
        json(
          res,
          {
            success: false,
            pluginId,
            error: "Plugin not found or not loaded",
            durationMs: Date.now() - startMs,
          },
          404,
        );
        return true;
      }

      // Check if plugin exposes a test/health method
      const testFn =
        (plugin as unknown as Record<string, unknown>).testConnection ??
        (plugin as unknown as Record<string, unknown>).healthCheck;
      if (typeof testFn === "function") {
        const result = await (
          testFn as () => Promise<{ ok: boolean; message?: string }>
        )();
        json(res, {
          success: result.ok !== false,
          pluginId,
          message:
            result.message ??
            (result.ok !== false
              ? "Connection successful"
              : "Connection failed"),
          durationMs: Date.now() - startMs,
        });
        return true;
      }

      // No test function — return a basic "plugin is loaded" status
      json(res, {
        success: true,
        pluginId,
        message: "Plugin is loaded and active (no custom test available)",
        durationMs: Date.now() - startMs,
      });
    } catch (err) {
      json(
        res,
        {
          success: false,
          pluginId,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        },
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/install ───────────────────────────────────────────
  // Install a plugin from the registry and restart the agent.
  if (method === "POST" && pathname === "/api/plugins/install") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return true;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return true;
    }

    const npmNamePattern =
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    if (!npmNamePattern.test(pluginName)) {
      error(res, "Invalid plugin name format", 400);
      return true;
    }

    try {
      const pluginManager = requirePluginManager(state.runtime);
      const result = await pluginManager.installPlugin(
        pluginName,
        (progress: InstallProgressLike) => {
          logger.info(`[install] ${progress.phase}: ${progress.message}`);
          state.broadcastWs?.({
            type: "install-progress",
            pluginName: progress.pluginName,
            phase: progress.phase,
            message: progress.message,
          });
        },
      );

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }

      // Auto-enable the newly installed plugin so the runtime loads it after restart.
      const installedId = (result.pluginName ?? pluginName)
        .replace(/^@[^/]+\/plugin-/, "")
        .replace(/^@[^/]+\//, "")
        .replace(/^plugin-/, "");
      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.entries) {
        (state.config.plugins as Record<string, unknown>).entries = {};
      }
      const pluginEntries = (state.config.plugins as Record<string, unknown>)
        .entries as Record<string, Record<string, unknown>>;
      pluginEntries[installedId] = { enabled: true };

      // Record the install path so plugin-resolver can find the package.
      // Without this, the downloaded package in ~/.milady/plugins/installed/
      // is invisible to the runtime loader.
      if (result.installPath) {
        if (
          !(state.config.plugins as Record<string, unknown>).installs ||
          typeof (state.config.plugins as Record<string, unknown>).installs !==
            "object"
        ) {
          (state.config.plugins as Record<string, unknown>).installs = {};
        }
        const installs = (state.config.plugins as Record<string, unknown>)
          .installs as Record<string, Record<string, unknown>>;
        installs[result.pluginName ?? pluginName] = {
          source: "npm",
          installPath: result.installPath,
          version: result.version ?? "unknown",
          installedAt: new Date().toISOString(),
        };
      }

      try {
        saveElizaConfig(state.config);
      } catch (err) {
        logger.warn(
          `[eliza-api] Failed to save config after install: ${err instanceof Error ? err.message : err}`,
        );
      }

      // If autoRestart is not explicitly false, restart the agent
      if (body.autoRestart !== false && result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${result.pluginName} installed`);
      }

      json(res, {
        ok: true,
        plugin: {
          name: result.pluginName,
          version: result.version,
          installPath: result.installPath,
        },
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${result.pluginName} installed. Agent will restart to load it.`
          : `${result.pluginName} installed.`,
      });
    } catch (err) {
      error(
        res,
        `Install failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/uninstall ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/plugins/uninstall") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return true;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return true;
    }

    try {
      const pluginManager = requirePluginManager(state.runtime);
      const result = await pluginManager.uninstallPlugin(pluginName);

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }

      if (body.autoRestart !== false && result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${pluginName} uninstalled`);
      }

      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${pluginName} uninstalled. Agent will restart.`
          : `${pluginName} uninstalled.`,
      });
    } catch (err) {
      error(
        res,
        `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/:id/eject ─────────────────────────────────────────
  if (method === "POST" && pathname.match(/^\/api\/plugins\/[^/]+\/eject$/)) {
    const pluginName = decodeURIComponent(
      pathname.slice("/api/plugins/".length, pathname.length - "/eject".length),
    );
    try {
      const pluginManager = requirePluginManager(state.runtime);
      // Ensure the method exists on the service (it should)
      if (typeof pluginManager.ejectPlugin !== "function") {
        throw new Error("Plugin manager does not support ejecting plugins");
      }
      const result = await pluginManager.ejectPlugin(pluginName);
      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }
      if (result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${pluginName} ejected`);
      }
      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: `${pluginName} ejected to local source.`,
      });
    } catch (err) {
      error(
        res,
        `Eject failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/:id/sync ──────────────────────────────────────────
  if (method === "POST" && pathname.match(/^\/api\/plugins\/[^/]+\/sync$/)) {
    const pluginName = decodeURIComponent(
      pathname.slice("/api/plugins/".length, pathname.length - "/sync".length),
    );
    try {
      const pluginManager = requirePluginManager(state.runtime);
      if (typeof pluginManager.syncPlugin !== "function") {
        throw new Error("Plugin manager does not support syncing plugins");
      }
      const result = await pluginManager.syncPlugin(pluginName);
      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }
      if (result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${pluginName} synced`);
      }
      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: `${pluginName} synced with upstream.`,
      });
    } catch (err) {
      error(
        res,
        `Sync failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/:id/reinject ──────────────────────────────────────
  if (
    method === "POST" &&
    pathname.match(/^\/api\/plugins\/[^/]+\/reinject$/)
  ) {
    const pluginName = decodeURIComponent(
      pathname.slice(
        "/api/plugins/".length,
        pathname.length - "/reinject".length,
      ),
    );
    try {
      const pluginManager = requirePluginManager(state.runtime);
      if (typeof pluginManager.reinjectPlugin !== "function") {
        throw new Error("Plugin manager does not support reinjecting plugins");
      }
      const result = await pluginManager.reinjectPlugin(pluginName);
      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }
      if (result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${pluginName} reinjected`);
      }
      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: `${pluginName} restored to registry version.`,
      });
    } catch (err) {
      error(
        res,
        `Reinject failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/plugins/installed ──────────────────────────────────────────
  // List plugins that were installed from the registry at runtime.
  if (method === "GET" && pathname === "/api/plugins/installed") {
    try {
      const pluginManager = requirePluginManager(state.runtime);
      const installed = await pluginManager.listInstalledPlugins();
      json(res, { count: installed.length, plugins: installed });
    } catch (err) {
      error(
        res,
        `Failed to list installed plugins: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/plugins/ejected ────────────────────────────────────────────
  // List plugins ejected to local source checkouts with upstream metadata.
  if (method === "GET" && pathname === "/api/plugins/ejected") {
    try {
      const pluginManager = requirePluginManager(state.runtime);
      if (typeof pluginManager.listEjectedPlugins !== "function") {
        throw new Error(
          "Plugin manager does not support listing ejected plugins",
        );
      }
      const plugins = await pluginManager.listEjectedPlugins();
      json(res, { count: plugins.length, plugins });
    } catch (err) {
      error(
        res,
        `Failed to list ejected plugins: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/core/status ────────────────────────────────────────────────
  // Returns whether @elizaos/core is ejected or resolved from npm.
  if (method === "GET" && pathname === "/api/core/status") {
    try {
      const coreManager = requireCoreManager(state.runtime);
      const coreStatus = await coreManager.getCoreStatus();
      json(res, coreStatus);
    } catch (err) {
      error(
        res,
        `Failed to get core status: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/plugins/core ────────────────────────────────────────────
  // Returns all core and optional core plugins with their loaded/running status.
  if (method === "GET" && pathname === "/api/plugins/core") {
    // Build a set of loaded plugin names for robust matching.
    // Plugin internal names vary wildly (e.g. "local-ai" for plugin-local-embedding,
    // "eliza-coder" for plugin-code), so we check loaded names against multiple
    // derived forms of the npm package name.
    const loadedNames: Set<string> = state.runtime
      ? new Set(state.runtime.plugins.map((p: { name: string }) => p.name))
      : new Set<string>();

    const isLoaded = (npmName: string): boolean => {
      if (loadedNames.has(npmName)) return true;
      // @elizaos/plugin-foo -> plugin-foo
      const withoutScope = npmName.replace("@elizaos/", "");
      if (loadedNames.has(withoutScope)) return true;
      // plugin-foo -> foo
      const shortId = withoutScope.replace("plugin-", "");
      if (loadedNames.has(shortId)) return true;
      // Check if ANY loaded name contains the short id or vice versa
      for (const n of loadedNames) {
        if (n.includes(shortId) || shortId.includes(n)) return true;
      }
      return false;
    };

    // Check which optional plugins are currently in the allow list
    const allowList = new Set(state.config.plugins?.allow ?? []);

    const makeEntry = (npm: string, isCore: boolean) => {
      const id = npm.replace("@elizaos/plugin-", "");
      return {
        npmName: npm,
        id,
        name: id
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        isCore,
        loaded: isLoaded(npm),
        enabled: isCore || allowList.has(npm) || allowList.has(id),
      };
    };

    const coreList = CORE_PLUGINS.map((npm: string) => makeEntry(npm, true));
    const optionalList = OPTIONAL_CORE_PLUGINS.map((npm: string) =>
      makeEntry(npm, false),
    );

    json(res, { core: coreList, optional: optionalList });
    return true;
  }

  // ── POST /api/plugins/core/toggle ─────────────────────────────────────
  // Enable or disable an optional core plugin by updating the allow list.
  if (method === "POST" && pathname === "/api/plugins/core/toggle") {
    const body = await readJsonBody<{ npmName: string; enabled: boolean }>(
      req,
      res,
    );
    if (!body || !body.npmName) return true;

    // Only allow toggling optional plugins, not core
    const isCorePlugin = (CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (isCorePlugin) {
      error(res, "Core plugins cannot be disabled");
      return true;
    }
    const isOptional = (OPTIONAL_CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (!isOptional) {
      error(res, "Unknown optional plugin");
      return true;
    }

    // Update the allow list in config
    state.config.plugins = state.config.plugins ?? {};
    state.config.plugins.allow = state.config.plugins.allow ?? [];
    const allow = state.config.plugins.allow;
    const shortId = body.npmName.replace("@elizaos/plugin-", "");

    if (body.enabled) {
      if (!allow.includes(body.npmName) && !allow.includes(shortId)) {
        allow.push(body.npmName);
      }
    } else {
      state.config.plugins.allow = allow.filter(
        (p: string) => p !== body.npmName && p !== shortId,
      );
    }

    try {
      saveElizaConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Auto-restart so the change takes effect
    scheduleRuntimeRestart(
      `Plugin ${shortId} ${body.enabled ? "enabled" : "disabled"}`,
    );

    json(res, {
      ok: true,
      restarting: true,
      message: `${shortId} ${body.enabled ? "enabled" : "disabled"}. Restarting...`,
    });
    return true;
  }

  return false;
}
