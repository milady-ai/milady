/**
 * Plugin discovery and categorization helpers.
 *
 * Extracted from server.ts. Handles reading the plugins.json manifest,
 * categorizing plugins, building parameter definitions, and aggregating
 * secrets for the plugin management UI.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type UUID } from "@elizaos/core";
import type { ElizaConfig } from "../config/config.js";
import {
  isConnectorConfigured,
  isStreamingDestinationConfigured,
} from "../config/plugin-auto-enable.js";
import {
  getBundledRuntimePluginIds,
  classifyRegistryPluginRelease,
} from "../runtime/release-plugin-policy.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import {
  applyWhatsAppQrOverride,
} from "./whatsapp-routes.js";
import {
  applySignalQrOverride,
} from "./signal-routes.js";
import { signalAuthExists } from "../services/signal-pairing.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";
import { findOwnPackageRoot } from "./server.js";

export interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  /** Predefined options for dropdown selection (e.g. model names). */
  options?: string[];
  /** Current value from process.env (masked if sensitive). */
  currentValue: string | null;
  /** Whether a value is currently set in the environment. */
  isSet: boolean;
}

export interface PluginEntry {
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
  /** Where the plugin comes from: "bundled" (ships with Eliza) or "store" (user-installed from registry). */
  source: "bundled" | "store";
  configKeys: string[];
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
  /** Whether this plugin is currently active in the runtime. */
  isActive?: boolean;
  /** Error message when plugin is enabled/installed but failed to load. */
  loadError?: string;
  /** Server-provided UI hints for plugin configuration fields. */
  configUiHints?: Record<string, Record<string, unknown>>;
  /** Optional icon URL or emoji for the plugin card header. */
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

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Set automatically when a scan report exists for this skill. */
  scanStatus?: "clean" | "warning" | "critical" | "blocked" | null;
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

export type StreamEventType =
  | "agent_event"
  | "heartbeat_event"
  | "training_event";

export interface StreamEventEnvelope {
  type: StreamEventType;
  version: 1;
  eventId: string;
  ts: number;
  runId?: string;
  seq?: number;
  stream?: string;
  sessionKey?: string;
  agentId?: string;
  roomId?: UUID;
  payload: object;
}


export function getReleaseBundledPluginIds(): Set<string> {
  const packageRoot = findOwnPackageRoot(
    import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)),
  );
  const packageJsonPath = path.join(packageRoot, "package.json");

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, string>;
    };
    return new Set(
      getBundledRuntimePluginIds(Object.keys(pkg.dependencies ?? {})),
    );
  } catch (err) {
    logger.warn(
      `[eliza-api] Failed to resolve bundled release plugins from package.json: ${err instanceof Error ? err.message : err}`,
    );
    return new Set();
  }
}


export interface PluginIndexEntry {
  id: string;
  dirName: string;
  name: string;
  npmName: string;
  description: string;
  tags?: string[];
  category:
    | "ai-provider"
    | "connector"
    | "streaming"
    | "database"
    | "app"
    | "feature";
  envKey: string | null;
  configKeys: string[];
  pluginParameters?: Record<string, Record<string, unknown>>;
  version?: string;
  pluginDeps?: string[];
  configUiHints?: Record<string, Record<string, unknown>>;
  logoUrl?: string;
  icon?: string;
  homepage?: string;
  repository?: string;
  setupGuideUrl?: string;
}

export interface PluginIndex {
  $schema: string;
  generatedAt: string;
  count: number;
  plugins: PluginIndexEntry[];
}

export function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function buildParamDefs(
  pluginParams: Record<string, Record<string, unknown>>,
): PluginParamDef[] {
  return Object.entries(pluginParams).map(([key, def]) => {
    const envValue = process.env[key];
    const isSet = Boolean(envValue?.trim());
    const sensitive = Boolean(def.sensitive);
    return {
      key,
      type: (def.type as string) ?? "string",
      description: (def.description as string) ?? "",
      required: Boolean(def.required),
      sensitive,
      default: def.default as string | undefined,
      options: Array.isArray(def.options)
        ? (def.options as string[])
        : undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue ?? "")
          : (envValue ?? "")
        : null,
      isSet,
    };
  });
}

/** Derive a human-readable description from an environment variable key. */
export function inferDescription(key: string): string {
  const upper = key.toUpperCase();

  // Special well-known suffixes
  if (upper.endsWith("_API_KEY"))
    return `API key for ${prefixLabel(key, "_API_KEY")}`;
  if (upper.endsWith("_BOT_TOKEN"))
    return `Bot token for ${prefixLabel(key, "_BOT_TOKEN")}`;
  if (upper.endsWith("_TOKEN"))
    return `Authentication token for ${prefixLabel(key, "_TOKEN")}`;
  if (upper.endsWith("_SECRET"))
    return `Secret for ${prefixLabel(key, "_SECRET")}`;
  if (upper.endsWith("_PRIVATE_KEY"))
    return `Private key for ${prefixLabel(key, "_PRIVATE_KEY")}`;
  if (upper.endsWith("_PASSWORD"))
    return `Password for ${prefixLabel(key, "_PASSWORD")}`;
  if (upper.endsWith("_RPC_URL"))
    return `RPC endpoint URL for ${prefixLabel(key, "_RPC_URL")}`;
  if (upper.endsWith("_BASE_URL"))
    return `Base URL for ${prefixLabel(key, "_BASE_URL")}`;
  if (upper.endsWith("_URL")) return `URL for ${prefixLabel(key, "_URL")}`;
  if (upper.endsWith("_ENDPOINT"))
    return `Endpoint for ${prefixLabel(key, "_ENDPOINT")}`;
  if (upper.endsWith("_HOST"))
    return `Host address for ${prefixLabel(key, "_HOST")}`;
  if (upper.endsWith("_PORT"))
    return `Port number for ${prefixLabel(key, "_PORT")}`;
  if (upper.endsWith("_MODEL") || upper.includes("_MODEL_"))
    return `Model identifier for ${prefixLabel(key, "_MODEL")}`;
  if (upper.endsWith("_VOICE") || upper.includes("_VOICE_"))
    return `Voice setting for ${prefixLabel(key, "_VOICE")}`;
  if (upper.endsWith("_DIR") || upper.endsWith("_PATH"))
    return `Directory path for ${prefixLabel(key, "_DIR").replace(/_PATH$/i, "")}`;
  if (upper.endsWith("_ENABLED") || upper.startsWith("ENABLE_"))
    return `Enable/disable ${prefixLabel(key, "_ENABLED").replace(/^ENABLE_/i, "")}`;
  if (upper.includes("DRY_RUN")) return `Dry-run mode (no real actions)`;
  if (upper.endsWith("_INTERVAL") || upper.endsWith("_INTERVAL_MINUTES"))
    return `Check interval for ${prefixLabel(key, "_INTERVAL")}`;
  if (upper.endsWith("_TIMEOUT") || upper.endsWith("_TIMEOUT_MS"))
    return `Timeout setting for ${prefixLabel(key, "_TIMEOUT")}`;

  // Generic: convert KEY_NAME to "Key name"
  return key
    .split("_")
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}

/** Extract the plugin/service prefix label from a key by removing a known suffix. */
export function prefixLabel(key: string, suffix: string): string {
  const raw = key.replace(new RegExp(`${suffix}$`, "i"), "").replace(/_+$/, "");
  if (!raw) return key;
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Blocked env keys — dangerous system vars that must never be written via API
// ---------------------------------------------------------------------------

export const BLOCKED_ENV_KEYS = new Set([
  // System-level injection vectors
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  // TLS bypass — setting to "0" disables ALL certificate verification,
  // enabling MITM interception of every outbound HTTPS request (API keys
  // for OpenAI, Anthropic, ElevenLabs etc. sent in plaintext headers).
  "NODE_TLS_REJECT_UNAUTHORIZED",
  // Proxy hijack — routes all HTTP/HTTPS traffic through attacker proxy,
  // exposing Authorization headers and API keys in transit.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  // Module resolution override
  "NODE_PATH",
  // CA certificate override — trust rogue CAs for MITM
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "CURL_CA_BUNDLE",
  "PATH",
  "HOME",
  "SHELL",
  // Auth / step-up tokens — writable via API would grant privilege escalation
  "MILADY_API_TOKEN",
  "ELIZA_API_TOKEN",
  "MILADY_WALLET_EXPORT_TOKEN",
  "ELIZA_WALLET_EXPORT_TOKEN",
  "MILADY_TERMINAL_RUN_TOKEN",
  "ELIZA_TERMINAL_RUN_TOKEN",
  "HYPERSCAPE_AUTH_TOKEN",
  // Wallet private keys — writable via API would enable key theft / replacement
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  // Opinion Trade plugin secrets
  "OPINION_PRIVATE_KEY",
  "OPINION_API_KEY",
  // Third-party auth tokens
  "GITHUB_TOKEN",
  // Database connection strings
  "DATABASE_URL",
  "POSTGRES_URL",
]);

/**
 * Top-level config keys accepted by `PUT /api/config`.
 * Keep this in sync with ElizaConfig root fields and include both modern and
 * legacy aliases (e.g. `connectors` + `channels`).
 */
export const CONFIG_WRITE_ALLOWED_TOP_KEYS = new Set([
  "meta",
  "auth",
  "env",
  "wizard",
  "diagnostics",
  "logging",
  "update",
  "browser",
  "ui",
  "skills",
  "plugins",
  "models",
  "nodeHost",
  "agents",
  "tools",
  "bindings",
  "broadcast",
  "audio",
  "messages",
  "commands",
  "approvals",
  "session",
  "web",
  "deploymentTarget",
  "linkedAccounts",
  "serviceRouting",
  "connectors",
  "channels",
  "cron",
  "hooks",
  "discovery",
  "talk",
  "gateway",
  "memory",
  "database",
  "media",
  "cloud",
  "x402",
  "mcp",
  "features",
]);

/**
 * Stream names accepted by `POST /api/agent/event`.
 * Plugins emit events to these streams for the StreamView UI.
 */
export const AGENT_EVENT_ALLOWED_STREAMS = new Set([
  "chat",
  "terminal",
  "game",
  "autonomy",

  "stream",
  "system",
  "message",
  "new_viewer",
  "assistant",
  "thought",
  "action",
  "viewer_stats",
]);

// ---------------------------------------------------------------------------
// Secrets aggregation — collect all sensitive params across plugins
// ---------------------------------------------------------------------------

export interface SecretEntry {
  key: string;
  description: string;
  category: string;
  sensitive: boolean;
  required: boolean;
  isSet: boolean;
  maskedValue: string | null;
  usedBy: Array<{ pluginId: string; pluginName: string; enabled: boolean }>;
}

const AI_PROVIDERS = new Set([
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "MISTRAL",
  "GROQ",
  "COHERE",
  "TOGETHER",
  "FIREWORKS",
  "PERPLEXITY",
  "DEEPSEEK",
  "XAI",
  "OPENROUTER",
  "ELEVENLABS",
  "REPLICATE",
  "HUGGINGFACE",
]);

export function inferSecretCategory(key: string): string {
  const upper = key.toUpperCase();

  // AI provider keys
  if (upper.endsWith("_API_KEY")) {
    const prefix = upper.replace(/_API_KEY$/, "");
    if (AI_PROVIDERS.has(prefix)) return "ai-provider";
  }

  // Blockchain
  if (
    upper.endsWith("_RPC_URL") ||
    upper.endsWith("_PRIVATE_KEY") ||
    upper.startsWith("SOLANA_") ||
    upper.startsWith("EVM_") ||
    upper.includes("_WALLET_") ||
    upper.includes("HELIUS") ||
    upper.includes("ALCHEMY") ||
    upper.includes("INFURA") ||
    upper.includes("ANKR") ||
    upper.includes("BIRDEYE")
  ) {
    return "blockchain";
  }

  // Connectors
  if (
    upper.endsWith("_BOT_TOKEN") ||
    upper.startsWith("TELEGRAM_") ||
    upper.startsWith("DISCORD_") ||
    upper.startsWith("TWITTER_") ||
    upper.startsWith("SLACK_") ||
    upper.startsWith("FARCASTER_")
  ) {
    return "connector";
  }

  // Auth
  if (
    upper.endsWith("_TOKEN") ||
    upper.endsWith("_SECRET") ||
    upper.endsWith("_PASSWORD")
  ) {
    return "auth";
  }

  return "other";
}

export function aggregateSecrets(plugins: PluginEntry[]): SecretEntry[] {
  const map = new Map<string, SecretEntry>();

  for (const plugin of plugins) {
    for (const param of plugin.parameters) {
      if (!param.sensitive) continue;

      const existing = map.get(param.key);
      if (existing) {
        existing.usedBy.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          enabled: plugin.enabled,
        });
        // Only mark required if an *enabled* plugin requires it
        if (param.required && plugin.enabled) existing.required = true;
      } else {
        const envValue = process.env[param.key];
        const isSet = Boolean(envValue?.trim());
        map.set(param.key, {
          key: param.key,
          description: param.description || inferDescription(param.key),
          category: inferSecretCategory(param.key),
          sensitive: true,
          required: param.required && plugin.enabled,
          isSet,
          maskedValue: isSet ? maskValue(envValue ?? "") : null,
          usedBy: [
            {
              pluginId: plugin.id,
              pluginName: plugin.name,
              enabled: plugin.enabled,
            },
          ],
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Discover user-installed plugins from the Store (not bundled in the manifest).
 * Reads from config.plugins.installs and tries to enrich with package.json metadata.
 */
export function discoverInstalledPlugins(
  config: ElizaConfig,
  bundledIds: Set<string>,
): PluginEntry[] {
  const installs = config.plugins?.installs;
  if (!installs || typeof installs !== "object") return [];

  const entries: PluginEntry[] = [];

  for (const [packageName, record] of Object.entries(installs)) {
    // Derive a short id from the package name (e.g. "@elizaos/plugin-foo" -> "foo")
    const id = packageName
      .replace(/^@[^/]+\/plugin-/, "")
      .replace(/^@[^/]+\//, "")
      .replace(/^plugin-/, "");

    // Skip if it's already covered by the bundled manifest
    if (bundledIds.has(id)) continue;

    const category = categorizePlugin(id);
    const installPath = (record as Record<string, string>).installPath;

    // Try to read the plugin's package.json for metadata
    let name = packageName;
    let description = `Installed from registry (v${(record as Record<string, string>).version ?? "unknown"})`;
    let pluginConfigKeys: string[] = [];
    let pluginParameters: PluginParamDef[] = [];
    let pluginTags: string[] = [];

    let pluginIcon: string | null = null;
    let pluginHomepage: string | undefined;
    let pluginRepository: string | undefined;

    if (installPath) {
      // Check npm layout first, then direct layout
      const candidates = [
        path.join(
          installPath,
          "node_modules",
          ...packageName.split("/"),
          "package.json",
        ),
        path.join(installPath, "package.json"),
      ];
      for (const pkgPath of candidates) {
        try {
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
              name?: string;
              description?: string;
              homepage?: string;
              repository?: string | { type?: string; url?: string };
              keywords?: string[];
              elizaos?: {
                displayName?: string;
                configKeys?: string[];
                configDefaults?: Record<string, string>;
                logoUrl?: string;
              };
              agentConfig?: {
                pluginParameters?: Record<string, Record<string, unknown>>;
              };
              logoUrl?: string;
              icon?: string;
            };
            if (pkg.name) name = pkg.name;
            if (pkg.description) description = pkg.description;
            pluginTags = normalizePluginMetadataTags(pkg.keywords);
            if (pkg.elizaos?.displayName) name = pkg.elizaos.displayName;
            if (pkg.elizaos?.configKeys) {
              pluginConfigKeys = pkg.elizaos.configKeys;
              const defaults = pkg.elizaos.configDefaults ?? {};
              pluginParameters = pluginConfigKeys.map((key) => ({
                key,
                label: key,
                description: "",
                required: false,
                sensitive:
                  key.toLowerCase().includes("key") ||
                  key.toLowerCase().includes("secret"),
                type: "string" as const,
                default: defaults[key] ?? undefined,
                isSet: Boolean(process.env[key]?.trim()),
                currentValue: null,
              }));
            } else if (pkg.agentConfig?.pluginParameters) {
              pluginConfigKeys = Object.keys(pkg.agentConfig.pluginParameters);
              pluginParameters = buildParamDefs(
                pkg.agentConfig.pluginParameters,
              );
            }
            // Map logoUrl or icon from package.json if available
            pluginIcon =
              pkg.logoUrl ?? pkg.elizaos?.logoUrl ?? pkg.icon ?? null;
            pluginHomepage =
              typeof pkg.homepage === "string" ? pkg.homepage : undefined;
            pluginRepository =
              normalizeRepositoryUrl(pkg.repository) ??
              deriveElizaRepositoryUrl(packageName, `plugin-${id}`);
            break;
          }
        } catch {
          // ignore read errors
        }
      }
    }

    const resolvedDescription = resolvePluginDescription(
      id,
      name,
      category,
      description,
    );
    const resolvedTags = resolvePluginTags(id, category, pluginTags);

    entries.push({
      id,
      name,
      npmName: packageName,
      description: resolvedDescription,
      tags: resolvedTags,
      enabled: false, // Will be updated against the runtime below
      configured:
        pluginConfigKeys.length === 0 || pluginParameters.some((p) => p.isSet),
      envKey: pluginConfigKeys[0] ?? null,
      category,
      source: "store",
      configKeys: pluginConfigKeys,
      parameters: pluginParameters,
      validationErrors: [],
      validationWarnings: [],
      icon: pluginIcon,
      homepage: pluginHomepage,
      repository: pluginRepository,
      setupGuideUrl: resolvePluginSetupGuideUrl(id),
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

// applyWhatsAppQrOverride is imported from ./whatsapp-routes

/**
 * Discover available plugins from the bundled plugins.json manifest.
 * Falls back to filesystem scanning for monorepo development.
 */
export function discoverPluginsFromManifest(): PluginEntry[] {
  const thisDir =
    import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = findOwnPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");

  if (fs.existsSync(manifestPath)) {
    try {
      const index = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as PluginIndex;
      // Keys that are auto-injected by infrastructure and should never be
      // exposed as user-facing "config keys" or parameter definitions.
      const HIDDEN_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);
      const entries = index.plugins
        .map((p) => {
          const inferredCategory = categorizePlugin(p.id);
          const category =
            inferredCategory === "feature"
              ? (p.category ?? inferredCategory)
              : inferredCategory;
          const envKey = p.envKey;
          const bundledMeta = readBundledPluginPackageMetadata(
            packageRoot,
            p.dirName,
            p.npmName,
          );
          const filteredConfigKeys = p.configKeys.filter(
            (k) => !HIDDEN_KEYS.has(k),
          );
          const configured = envKey
            ? Boolean(process.env[envKey])
            : filteredConfigKeys.length === 0;
          const filteredParams = p.pluginParameters
            ? Object.fromEntries(
                Object.entries(p.pluginParameters).filter(
                  ([k]) => !HIDDEN_KEYS.has(k),
                ),
              )
            : undefined;
          const parameters = filteredParams
            ? buildParamDefs(filteredParams)
            : [];
          const paramInfos: PluginParamInfo[] = parameters.map((pd) => ({
            key: pd.key,
            required: pd.required,
            sensitive: pd.sensitive,
            type: pd.type,
            description: pd.description,
            default: pd.default,
          }));
          const validation = validatePluginConfig(
            p.id,
            category,
            envKey,
            filteredConfigKeys,
            undefined,
            paramInfos,
          );

          const description = resolvePluginDescription(
            p.id,
            p.name,
            category,
            p.description || bundledMeta.description,
          );
          const tags = resolvePluginTags(
            p.id,
            category,
            p.tags,
            bundledMeta.tags,
          );

          return {
            id: p.id,
            name: p.name,
            description,
            tags,
            enabled: false,
            configured,
            envKey,
            category,
            source: "bundled" as const,
            configKeys: filteredConfigKeys,
            parameters,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            npmName: p.npmName,
            version: p.version,
            pluginDeps: p.pluginDeps,
            ...(p.configUiHints ? { configUiHints: p.configUiHints } : {}),
            icon: p.logoUrl ?? p.icon ?? bundledMeta.icon ?? null,
            homepage: p.homepage ?? bundledMeta.homepage,
            repository:
              p.repository ??
              bundledMeta.repository ??
              deriveElizaRepositoryUrl(p.npmName, p.dirName),
            setupGuideUrl: p.setupGuideUrl ?? resolvePluginSetupGuideUrl(p.id),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      applyWhatsAppQrOverride(entries, resolveDefaultAgentWorkspaceDir());
      applySignalQrOverride(
        entries,
        resolveDefaultAgentWorkspaceDir(),
        signalAuthExists,
      );

      return entries;
    } catch (err) {
      logger.debug(
        `[eliza-api] Failed to read plugins.json: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Fallback: no manifest found
  logger.debug(
    "[eliza-api] plugins.json not found — run `npm run generate:plugins`",
  );
  return [];
}

export function categorizePlugin(
  id: string,
): "ai-provider" | "connector" | "streaming" | "database" | "feature" {
  const aiProviders = [
    "openai",
    "anthropic",
    "groq",
    "xai",
    "ollama",
    "openrouter",
    "google-genai",
    "local-ai",
    "vercel-ai-gateway",
    "deepseek",
    "together",
    "mistral",
    "cohere",
    "perplexity",
    "qwen",
    "minimax",
    "zai",
    "pi-ai",
  ];
  const connectors = [
    "telegram",
    "discord",
    "slack",
    "twitter",
    "whatsapp",
    "signal",
    "imessage",
    "bluebubbles",
    "farcaster",
    "bluesky",
    "matrix",
    "nostr",
    "msteams",
    "mattermost",
    "google-chat",
    "feishu",
    "line",
    "zalo",
    "zalouser",
    "tlon",
    "nextcloud-talk",
    "instagram",
    "blooio",
    "twitch",
  ];
  const streamingDests = [
    "streaming-base",
    "custom-rtmp",
    "youtube",
    "youtube-streaming",
    "twitch-streaming",
    "x-streaming",
    "pumpfun-streaming",
  ];
  const databases = ["sql", "localdb", "inmemorydb"];

  if (aiProviders.includes(id)) return "ai-provider";
  if (streamingDests.includes(id)) return "streaming";
  if (connectors.includes(id)) return "connector";
  if (databases.includes(id)) return "database";
  return "feature";
}

const PLUGIN_SETUP_GUIDE_ROOT = "https://docs.eliza.ai/plugin-setup-guide";
const ELIZA_REPO_ROOT = "https://github.com/elizaos/eliza";
const PLUGIN_METADATA_TAG_STOPWORDS = new Set([
  "plugin",
  "plugins",
  "eliza",
  "elizaos",
  "eliza",
  "elizaos-plugin",
  "elizaos-plugins",
  "feature",
]);
const SOCIAL_CHAT_CONNECTOR_IDS = new Set([
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "imessage",
  "bluebubbles",
  "matrix",
  "mattermost",
  "msteams",
  "google-chat",
  "feishu",
  "line",
  "zalo",
  "zalouser",
  "tlon",
  "nextcloud-talk",
  "blooio",
  "twilio",
  "twitch",
]);
const SOCIAL_FEED_CONNECTOR_IDS = new Set([
  "twitter",
  "bluesky",
  "farcaster",
  "instagram",
  "nostr",
]);
const PLUGIN_METADATA_CATEGORY_TAGS: Record<string, string[]> = {
  "ai-provider": ["ai-provider", "llm"],
  connector: ["connector"],
  streaming: ["streaming", "broadcast"],
  database: ["database", "storage"],
  app: ["app", "interactive"],
  feature: ["feature"],
};
const PLUGIN_DESCRIPTION_OVERRIDES: Record<string, string> = {
  slack: "Slack workspace connector for chatting with your agent",
  signal: "Signal connector for secure chats with your agent",
  mattermost: "Mattermost connector for team chat with your agent",
  msteams: "Microsoft Teams connector for chatting with your agent",
  "nextcloud-talk": "Nextcloud Talk connector for chatting with your agent",
  blooio: "Blooio SMS connector for texting your agent",
  github:
    "GitHub connector for issues, pull requests, and repository automation",
  "gmail-watch":
    "Gmail watcher that turns new incoming emails into agent events",
  mcp: "Model Context Protocol connector for external tools and servers",
};

const PLUGIN_SETUP_GUIDE_ANCHORS: Record<string, string> = {
  openai: "#openai",
  anthropic: "#anthropic",
  "google-genai": "#google-gemini",
  groq: "#groq",
  openrouter: "#openrouter",
  xai: "#xai-grok",
  ollama: "#ollama-local-models",
  "local-ai": "#local-ai",
  "vercel-ai-gateway": "#vercel-ai-gateway",
  discord: "#discord",
  telegram: "#telegram",
  twitter: "#twitter--x",
  slack: "#slack",
  whatsapp: "#whatsapp",
  instagram: "#instagram",
  bluesky: "#bluesky",
  farcaster: "#farcaster",
  github: "#github",
  twitch: "#twitch",
  twilio: "#twilio-sms--voice",
  matrix: "#matrix",
  msteams: "#microsoft-teams",
  "google-chat": "#google-chat",
  signal: "#signal",
  imessage: "#imessage-macos-only",
  bluebubbles: "#bluebubbles-imessage-from-any-platform",
  blooio: "#blooio-sms-via-api",
  nostr: "#nostr",
  line: "#line",
  feishu: "#feishu-lark",
  mattermost: "#mattermost",
  "nextcloud-talk": "#nextcloud-talk",
  tlon: "#tlon-urbit",
  zalo: "#zalo-vietnam-messaging",
  zalouser: "#zalo-user-personal",
  acp: "#acp-agent-communication-protocol",
  mcp: "#mcp-model-context-protocol",
  iq: "#iq-solana-on-chain",
  "gmail-watch": "#gmail-watch",
  "streaming-base": "#enable-streaming-streaming-base",
  "twitch-streaming": "#twitch-streaming",
  "youtube-streaming": "#youtube-streaming",
  "x-streaming": "#x-streaming",
  "pumpfun-streaming": "#pumpfun-streaming",
  "custom-rtmp": "#custom-rtmp",
};

export function resolvePluginSetupGuideUrl(id: string): string | undefined {
  const anchor = PLUGIN_SETUP_GUIDE_ANCHORS[id];
  return anchor ? `${PLUGIN_SETUP_GUIDE_ROOT}${anchor}` : undefined;
}

export function normalizeRepositoryUrl(
  repository: string | { type?: string; url?: string } | null | undefined,
): string | undefined {
  const raw =
    typeof repository === "string"
      ? repository.trim()
      : repository?.url?.trim() || "";
  if (!raw) return undefined;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}`;
  if (raw.startsWith("git@github.com:")) {
    return `https://github.com/${raw
      .slice("git@github.com:".length)
      .replace(/\.git$/, "")}`;
  }
  if (raw.startsWith("git+https://")) return raw.slice(4).replace(/\.git$/, "");
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    return raw.replace(/\.git$/, "");
  }
  return undefined;
}

export function deriveElizaRepositoryUrl(
  npmName: string | undefined,
  dirName: string | undefined,
): string | undefined {
  if (!npmName?.startsWith("@elizaos/")) return undefined;
  if (!dirName?.startsWith("plugin-")) return undefined;
  return `${ELIZA_REPO_ROOT}/tree/main/packages/${dirName}`;
}

export function normalizePluginMetadataTag(tag: string): string | null {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || PLUGIN_METADATA_TAG_STOPWORDS.has(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizePluginMetadataTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = normalizePluginMetadataTag(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags;
}

export function mergePluginMetadataTags(...sources: unknown[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const tag of normalizePluginMetadataTags(source)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export function pluginIdTags(id: string): string[] {
  return normalizePluginMetadataTags([id, ...id.split("-")]);
}

export function connectorMetadataTags(id: string): string[] {
  if (SOCIAL_CHAT_CONNECTOR_IDS.has(id)) {
    return ["social", "social-chat", "messaging"];
  }
  if (SOCIAL_FEED_CONNECTOR_IDS.has(id)) {
    return ["social", "social-feed"];
  }
  return ["integration"];
}

export function resolvePluginDescription(
  id: string,
  name: string,
  category: PluginEntry["category"],
  description: string | undefined,
): string {
  const displayName = name.startsWith("@") ? formatPluginName(id) : name;
  const trimmed = description?.trim();
  if (trimmed) return trimmed;
  if (PLUGIN_DESCRIPTION_OVERRIDES[id]) return PLUGIN_DESCRIPTION_OVERRIDES[id];
  if (category === "ai-provider") {
    return `${displayName} AI provider for Eliza agents`;
  }
  if (category === "connector") {
    if (SOCIAL_CHAT_CONNECTOR_IDS.has(id)) {
      return `${displayName} connector for chatting with your agent`;
    }
    if (SOCIAL_FEED_CONNECTOR_IDS.has(id)) {
      return `${displayName} social connector for connecting your agent to ${displayName}`;
    }
    return `${displayName} connector plugin for Eliza agents`;
  }
  if (category === "streaming") {
    return `${displayName} streaming destination for live agent broadcasts`;
  }
  if (category === "database") {
    return `${displayName} storage plugin for Eliza agents`;
  }
  if (category === "app") {
    return `${displayName} interactive app for Eliza agents`;
  }
  return `${displayName} plugin for Eliza agents`;
}

export function resolvePluginTags(
  id: string,
  category: PluginEntry["category"],
  ...sources: unknown[]
): string[] {
  return mergePluginMetadataTags(
    ...sources,
    PLUGIN_METADATA_CATEGORY_TAGS[category] ?? [],
    category === "connector" ? connectorMetadataTags(id) : [],
    pluginIdTags(id),
  );
}

export function formatPluginName(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function readBundledPluginPackageMetadata(
  packageRoot: string,
  dirName: string,
  npmName?: string,
): {
  description?: string;
  homepage?: string;
  repository?: string;
  icon?: string | null;
  tags?: string[];
} {
  const pkgPath = path.join(packageRoot, "packages", dirName, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return {
      repository: deriveElizaRepositoryUrl(npmName, dirName),
      tags: [],
    };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      description?: string;
      homepage?: string;
      repository?: string | { type?: string; url?: string };
      keywords?: string[];
      logoUrl?: string;
      icon?: string;
      elizaos?: { logoUrl?: string };
    };
    return {
      description: pkg.description?.trim() || undefined,
      homepage: pkg.homepage ?? undefined,
      repository:
        normalizeRepositoryUrl(pkg.repository) ??
        deriveElizaRepositoryUrl(npmName, dirName),
      icon: pkg.logoUrl ?? pkg.elizaos?.logoUrl ?? pkg.icon ?? null,
      tags: normalizePluginMetadataTags(pkg.keywords),
    };
  } catch {
    return {
      repository: deriveElizaRepositoryUrl(npmName, dirName),
      tags: [],
    };
  }
}
