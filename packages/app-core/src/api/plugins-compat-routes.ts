import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AgentRuntime, logger } from "@elizaos/core";
import {
  loadElizaConfig,
  saveElizaConfig,
} from "@miladyai/agent/config/config";
import {
  ensureCompatApiAuthorized,
  ensureCompatSensitiveRouteAuthorized,
} from "./auth";
import {
  sendJsonError as sendJsonErrorResponse,
  sendJson as sendJsonResponse,
} from "./response";
import {
  scheduleCompatRuntimeRestart,
  readCompatJsonBody,
  type CompatRuntimeState,
} from "./compat-route-shared";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PluginCategory =
  | "ai-provider"
  | "connector"
  | "streaming"
  | "database"
  | "app"
  | "feature";

interface ManifestPluginParameter {
  type?: string;
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  default?: string | number | boolean;
  options?: string[];
}

interface ManifestPluginEntry {
  id: string;
  dirName?: string;
  name?: string;
  npmName?: string;
  description?: string;
  tags?: string[];
  category?: string;
  envKey?: string;
  configKeys?: string[];
  version?: string;
  pluginDeps?: string[];
  pluginParameters?: Record<string, ManifestPluginParameter>;
  configUiHints?: Record<string, Record<string, unknown>>;
  icon?: string | null;
  logoUrl?: string | null;
  homepage?: string;
  repository?: string;
  setupGuideUrl?: string;
}

interface PluginManifestFile {
  plugins?: ManifestPluginEntry[];
}

interface RuntimePluginLike {
  name?: string;
  description?: string;
}

interface CompatPluginParameter {
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

interface CompatPluginRecord {
  id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  envKey?: string | null;
  category?: PluginCategory;
  source?: string;
  parameters: CompatPluginParameter[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings?: Array<{ field?: string; message: string }>;
  npmName?: string;
  version?: string;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAPABILITY_FEATURE_IDS = new Set([
  "vision",
  "browser",
  "computeruse",
  "coding-agent",
]);

// Key prefixes that contain wallet private keys or other high-value secrets
// require the hardened sensitive-route auth (loopback + elevated checks).
const SENSITIVE_KEY_PREFIXES = ["SOLANA_", "ETHEREUM_", "EVM_", "WALLET_"];

const REVEALABLE_KEY_PREFIXES = [
  "OPENAI_",
  "ANTHROPIC_",
  "GOOGLE_",
  "GROQ_",
  "MISTRAL_",
  "PERPLEXITY_",
  "COHERE_",
  "TOGETHER_",
  "FIREWORKS_",
  "REPLICATE_",
  "HUGGINGFACE_",
  "ELEVENLABS_",
  "DISCORD_",
  "TELEGRAM_",
  "TWITTER_",
  "SLACK_",
  "GITHUB_",
  "REDIS_",
  "POSTGRES_",
  "DATABASE_",
  "SUPABASE_",
  "PINECONE_",
  "QDRANT_",
  "WEAVIATE_",
  "CHROMADB_",
  "AWS_",
  "AZURE_",
  "CLOUDFLARE_",
  "ELIZA_",
  "MILADY_",
  "PLUGIN_",
  "XAI_",
  "DEEPSEEK_",
  "OLLAMA_",
  "FAL_",
  "LETZAI_",
  "GAIANET_",
  "LIVEPEER_",
  ...SENSITIVE_KEY_PREFIXES,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function normalizePluginCategory(value: string | undefined): PluginCategory {
  switch (value) {
    case "ai-provider":
    case "connector":
    case "streaming":
    case "database":
    case "app":
      return value;
    default:
      return "feature";
  }
}

function normalizePluginId(rawName: string): string {
  return rawName
    .replace(/^@[^/]+\/plugin-/, "")
    .replace(/^@[^/]+\/app-/, "")
    .replace(/^@[^/]+\//, "")
    .replace(/^(plugin|app)-/, "");
}

function titleCasePluginId(id: string): string {
  return id
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildPluginParamDefs(
  parameters: Record<string, ManifestPluginParameter> | undefined,
  savedValues?: Record<string, string>,
): Array<{
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  options?: string[];
  currentValue: string | null;
  isSet: boolean;
}> {
  if (!parameters) {
    return [];
  }

  return Object.entries(parameters).map(([key, definition]) => {
    const envValue = process.env[key]?.trim() || undefined;
    const savedValue = savedValues?.[key];
    const effectiveValue =
      envValue ?? (savedValue ? savedValue.trim() || undefined : undefined);
    const isSet = Boolean(effectiveValue);
    const sensitive = Boolean(definition.sensitive);
    const currentValue =
      !isSet || !effectiveValue
        ? null
        : sensitive
          ? maskValue(effectiveValue)
          : effectiveValue;

    return {
      key,
      type: definition.type ?? "string",
      description: definition.description ?? "",
      required: Boolean(definition.required),
      sensitive,
      default:
        definition.default === undefined
          ? undefined
          : String(definition.default),
      options: Array.isArray(definition.options)
        ? definition.options
        : undefined,
      currentValue,
      isSet,
    };
  });
}

function findNearestFile(
  startDir: string,
  fileName: string,
  maxDepth = 12,
): string | null {
  let dir = path.resolve(startDir);

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}

export function resolvePluginManifestPath(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    moduleDir,
    path.dirname(process.execPath),
    path.join(path.dirname(process.execPath), "..", "Resources", "app"),
  ];

  for (const candidate of candidates) {
    const manifestPath = findNearestFile(candidate, "plugins.json");
    if (manifestPath) {
      return manifestPath;
    }
  }

  return null;
}

function resolveInstalledPackageVersion(
  packageName: string | undefined,
): string | null {
  if (!packageName) {
    return null;
  }

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

function resolveLoadedPluginNames(runtime: AgentRuntime | null): Set<string> {
  const loadedNames = new Set<string>();

  for (const plugin of runtime?.plugins ?? []) {
    const name = (plugin as RuntimePluginLike).name;
    if (typeof name === "string" && name.length > 0) {
      loadedNames.add(name);
    }
  }

  return loadedNames;
}

function isPluginLoaded(
  pluginId: string,
  npmName: string | undefined,
  loadedNames: Set<string>,
): boolean {
  const expectedNames = new Set<string>([
    pluginId,
    `plugin-${pluginId}`,
    `app-${pluginId}`,
    npmName ?? "",
  ]);

  for (const loadedName of loadedNames) {
    if (expectedNames.has(loadedName)) {
      return true;
    }
    if (
      loadedName.endsWith(`/plugin-${pluginId}`) ||
      loadedName.endsWith(`/app-${pluginId}`) ||
      loadedName.includes(pluginId)
    ) {
      return true;
    }
  }

  return false;
}

export function buildPluginListResponse(runtime: AgentRuntime | null): {
  plugins: Array<Record<string, unknown>>;
} {
  const config = loadElizaConfig();
  const loadedNames = resolveLoadedPluginNames(runtime);
  const manifestPath = resolvePluginManifestPath();
  const manifest = manifestPath
    ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PluginManifestFile)
    : null;

  const configEntries = config.plugins?.entries ?? {};
  const installEntries = config.plugins?.installs ?? {};
  const plugins = new Map<string, Record<string, unknown>>();

  for (const entry of manifest?.plugins ?? []) {
    const pluginId = normalizePluginId(entry.id);
    const parameters = buildPluginParamDefs(entry.pluginParameters);
    const active = isPluginLoaded(pluginId, entry.npmName, loadedNames);
    const enabled =
      active ||
      (typeof configEntries[pluginId]?.enabled === "boolean"
        ? Boolean(configEntries[pluginId]?.enabled)
        : false);
    const validationErrors = parameters
      .filter((parameter) => parameter.required && !parameter.isSet)
      .map((parameter) => ({
        field: parameter.key,
        message: "Required value is not configured.",
      }));

    plugins.set(pluginId, {
      id: pluginId,
      name: entry.name ?? titleCasePluginId(pluginId),
      description: entry.description ?? "",
      tags: entry.tags ?? [],
      enabled,
      configured: validationErrors.length === 0,
      envKey: entry.envKey ?? null,
      category: normalizePluginCategory(entry.category),
      source: "bundled",
      parameters,
      validationErrors,
      validationWarnings: [],
      npmName: entry.npmName,
      version:
        resolveInstalledPackageVersion(entry.npmName) ??
        entry.version ??
        undefined,
      pluginDeps: entry.pluginDeps,
      isActive: active,
      configUiHints: entry.configUiHints,
      icon: entry.logoUrl ?? entry.icon ?? null,
      homepage: entry.homepage,
      repository: entry.repository,
      setupGuideUrl: entry.setupGuideUrl,
    });
  }

  for (const plugin of runtime?.plugins ?? []) {
    const pluginName =
      typeof (plugin as RuntimePluginLike).name === "string"
        ? (plugin as RuntimePluginLike).name
        : "";
    if (!pluginName) {
      continue;
    }

    const pluginId = normalizePluginId(pluginName);
    const existing = plugins.get(pluginId);
    if (existing) {
      existing.isActive = true;
      if (
        existing.enabled !== true &&
        configEntries[pluginId]?.enabled == null
      ) {
        existing.enabled = true;
      }
      if (!existing.version) {
        existing.version =
          resolveInstalledPackageVersion(pluginName) ?? undefined;
      }
      continue;
    }

    plugins.set(pluginId, {
      id: pluginId,
      name: titleCasePluginId(pluginId),
      description:
        (plugin as RuntimePluginLike).description ??
        "Loaded runtime plugin discovered without manifest metadata.",
      tags: [],
      enabled:
        typeof configEntries[pluginId]?.enabled === "boolean"
          ? Boolean(configEntries[pluginId]?.enabled)
          : true,
      configured: true,
      envKey: null,
      category: "feature",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
      npmName: pluginName,
      version: resolveInstalledPackageVersion(pluginName) ?? undefined,
      isActive: true,
      icon: null,
    });
  }

  for (const [pluginName, installRecord] of Object.entries(installEntries)) {
    const pluginId = normalizePluginId(pluginName);
    if (plugins.has(pluginId)) {
      continue;
    }

    plugins.set(pluginId, {
      id: pluginId,
      name: titleCasePluginId(pluginId),
      description: "Installed store plugin.",
      tags: [],
      enabled:
        typeof configEntries[pluginId]?.enabled === "boolean"
          ? Boolean(configEntries[pluginId]?.enabled)
          : false,
      configured: true,
      envKey: null,
      category: "feature",
      source: "store",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
      npmName: pluginName,
      version:
        typeof installRecord?.version === "string"
          ? installRecord.version
          : (resolveInstalledPackageVersion(pluginName) ?? undefined),
      isActive: isPluginLoaded(pluginId, pluginName, loadedNames),
      icon: null,
    });
  }

  const pluginList = Array.from(plugins.values()).sort((left, right) =>
    String(left.name ?? "").localeCompare(String(right.name ?? "")),
  );
  return { plugins: pluginList };
}

function validateCompatPluginConfig(
  plugin: CompatPluginRecord,
  config: Record<string, unknown>,
): {
  errors: Array<{ field: string; message: string }>;
  values: Record<string, string>;
} {
  const paramMap = new Map(
    plugin.parameters.map((parameter) => [parameter.key, parameter]),
  );
  const errors: Array<{ field: string; message: string }> = [];
  const values: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(config)) {
    const parameter = paramMap.get(key);
    if (!parameter) {
      errors.push({
        field: key,
        message: `${key} is not a declared config key for this plugin`,
      });
      continue;
    }

    if (typeof rawValue !== "string") {
      errors.push({
        field: key,
        message: "Plugin config values must be strings.",
      });
      continue;
    }

    const trimmed = rawValue.trim();
    if (parameter.required && trimmed.length === 0) {
      errors.push({
        field: key,
        message: "Required value is not configured.",
      });
      continue;
    }

    values[key] = rawValue;
  }

  return { errors, values };
}

export function persistCompatPluginMutation(
  pluginId: string,
  body: Record<string, unknown>,
  plugin: CompatPluginRecord,
): {
  status: number;
  payload: Record<string, unknown>;
} {
  const config = loadElizaConfig();
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.plugins.entries[pluginId] ??= {};
  const pluginEntry = config.plugins.entries[pluginId] as Record<
    string,
    unknown
  >;

  if (typeof body.enabled === "boolean") {
    pluginEntry.enabled = body.enabled;

    if (CAPABILITY_FEATURE_IDS.has(pluginId)) {
      config.features ??= {};
      config.features[pluginId] = body.enabled;
    }
  }

  if (body.config !== undefined) {
    if (
      !body.config ||
      typeof body.config !== "object" ||
      Array.isArray(body.config)
    ) {
      return {
        status: 400,
        payload: { ok: false, error: "Plugin config must be a JSON object." },
      };
    }

    const configObject = body.config as Record<string, unknown>;
    const { errors, values } = validateCompatPluginConfig(plugin, configObject);
    if (errors.length > 0) {
      return {
        status: 422,
        payload: { ok: false, plugin, validationErrors: errors },
      };
    }

    const nextConfig =
      pluginEntry.config &&
      typeof pluginEntry.config === "object" &&
      !Array.isArray(pluginEntry.config)
        ? { ...(pluginEntry.config as Record<string, unknown>) }
        : {};

    config.env ??= {};
    for (const [key, value] of Object.entries(values)) {
      if (value.trim()) {
        config.env[key] = value;
        nextConfig[key] = value;
      } else {
        delete config.env[key];
        delete nextConfig[key];
      }
    }

    pluginEntry.config = nextConfig;

    saveElizaConfig(config);

    for (const [key, value] of Object.entries(values)) {
      try {
        if (value.trim()) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      } catch {
        // process.env may be read-only in sandboxed or frozen environments.
        // Config is already persisted to disk above, so this is non-fatal.
      }
    }
  } else {
    saveElizaConfig(config);
  }

  const refreshed = (
    buildPluginListResponse(null).plugins as unknown as CompatPluginRecord[]
  ).find((candidate) => candidate.id === pluginId);

  return {
    status: 200,
    payload: {
      ok: true,
      plugin: refreshed ?? plugin,
    },
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Plugin management routes.
 *
 * - `GET  /api/plugins`           — returns filtered plugin list
 * - `PUT  /api/plugins/:id`       — updates plugin config, writes env vars
 * - `POST /api/plugins/:id/test`  — tests plugin connectivity
 * - `POST /api/plugins/:id/reveal`— reveals plugin env var value
 */
export async function handlePluginsCompatRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");

  if (!url.pathname.startsWith("/api/plugins")) {
    return false;
  }

  if (method === "GET" && url.pathname === "/api/plugins") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const pluginResponse = buildPluginListResponse(state.current);
    const manifestPath = resolvePluginManifestPath();
    logger.debug(
      `[api/plugins] manifest=${manifestPath ?? "NOT_FOUND"} total=${pluginResponse.plugins.length} runtime=${state.current ? "active" : "null"}`,
    );
    sendJsonResponse(res, 200, pluginResponse);
    return true;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/plugins/")) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const pluginId = normalizePluginId(
      decodeURIComponent(url.pathname.slice("/api/plugins/".length)),
    );
    const plugin = (
      buildPluginListResponse(state.current)
        .plugins as unknown as CompatPluginRecord[]
    ).find((candidate) => candidate.id === pluginId);

    if (!plugin) {
      sendJsonErrorResponse(res, 404, `Plugin "${pluginId}" not found`);
      return true;
    }

    const result = persistCompatPluginMutation(pluginId, body, plugin);
    if (result.status === 200 && typeof body.enabled === "boolean") {
      scheduleCompatRuntimeRestart(state, `Plugin toggle: ${pluginId}`);
    }
    sendJsonResponse(res, result.status, result.payload);
    return true;
  }

  const testMatch =
    method === "POST" && url.pathname.match(/^\/api\/plugins\/([^/]+)\/test$/);
  if (testMatch) {
    if (!ensureCompatApiAuthorized(req, res)) return true;
    const testPluginId = normalizePluginId(decodeURIComponent(testMatch[1]));
    const startMs = Date.now();

    if (testPluginId === "telegram") {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        sendJsonResponse(res, 422, {
          success: false,
          pluginId: testPluginId,
          error: "No bot token configured",
          durationMs: Date.now() - startMs,
        });
        return true;
      }
      try {
        const apiRoot =
          process.env.TELEGRAM_API_ROOT || "https://api.telegram.org";
        const tgResp = await fetch(`${apiRoot}/bot${token}/getMe`);
        const tgData = (await tgResp.json()) as {
          ok: boolean;
          result?: { username?: string };
          description?: string;
        };
        sendJsonResponse(res, tgData.ok ? 200 : 422, {
          success: tgData.ok,
          pluginId: testPluginId,
          message: tgData.ok
            ? `Connected as @${tgData.result?.username}`
            : `Telegram API error: ${tgData.description}`,
          durationMs: Date.now() - startMs,
        });
      } catch (err) {
        sendJsonResponse(res, 422, {
          success: false,
          pluginId: testPluginId,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        });
      }
      return true;
    }

    sendJsonResponse(res, 200, {
      success: true,
      pluginId: testPluginId,
      message: "Plugin is loaded (no custom test available)",
      durationMs: Date.now() - startMs,
    });
    return true;
  }

  const revealMatch =
    method === "POST" &&
    url.pathname.match(/^\/api\/plugins\/([^/]+)\/reveal$/);
  if (revealMatch) {
    if (!ensureCompatApiAuthorized(req, res)) return true;
    const revealBody = await readCompatJsonBody(req, res);
    if (revealBody == null) return true;
    const key = (revealBody.key as string)?.trim();
    if (!key) {
      sendJsonErrorResponse(res, 400, "Missing key parameter");
      return true;
    }
    const upperKey = key.toUpperCase();
    if (
      !REVEALABLE_KEY_PREFIXES.some((prefix) => upperKey.startsWith(prefix))
    ) {
      sendJsonErrorResponse(
        res,
        403,
        "Key is not in the allowlist of revealable plugin config keys",
      );
      return true;
    }
    // Wallet / private-key prefixes require elevated auth to prevent
    // accidental exposure through the general plugin config UI.
    if (SENSITIVE_KEY_PREFIXES.some((prefix) => upperKey.startsWith(prefix))) {
      if (!ensureCompatSensitiveRouteAuthorized(req, res)) return true;
    }
    const config = loadElizaConfig();
    const value =
      process.env[key] ??
      (config.env as Record<string, string> | undefined)?.[key] ??
      null;
    sendJsonResponse(res, 200, { ok: true, value });
    return true;
  }

  return false;
}
