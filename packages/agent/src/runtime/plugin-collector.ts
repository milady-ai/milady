/**
 * Plugin name collection and validation.
 *
 * Determines which plugin packages should be loaded based on config,
 * environment variables, feature flags, and provider precedence rules.
 *
 * Extracted from eliza.ts to reduce file size.
 *
 * @module plugin-collector
 */
import type { ElizaConfig } from "../config/config";
import { CORE_PLUGINS, OPTIONAL_CORE_PLUGINS } from "./core-plugins";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PI_AI_PLUGIN_PACKAGE = "@elizaos/plugin-pi-ai";

function isPiAiEnabledFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ELIZA_USE_PI_AI ?? env.MILADY_USE_PI_AI;
  if (!raw) return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Maps Eliza channel names to plugin package names. */
export const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@elizaos/plugin-telegram",
  slack: "@elizaos/plugin-slack",
  twitter: "@elizaos/plugin-twitter",
  // Internal connector built from src/plugins/whatsapp (not an npm package).
  whatsapp: "@elizaos/plugin-whatsapp",
  // Internal connector built from src/plugins/signal (not an npm package).
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  farcaster: "@elizaos/plugin-farcaster",
  lens: "@elizaos/plugin-lens",
  msteams: "@elizaos/plugin-msteams",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
  feishu: "@elizaos/plugin-feishu",
  matrix: "@elizaos/plugin-matrix",
  nostr: "@elizaos/plugin-nostr",
  blooio: "@elizaos/plugin-blooio",
  twitch: "@elizaos/plugin-twitch",
};

/** Maps environment variable names to model-provider plugin packages. */
export const PROVIDER_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  GEMINI_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  DEEPSEEK_API_KEY: "@elizaos/plugin-deepseek",
  MISTRAL_API_KEY: "@elizaos/plugin-mistral",
  TOGETHER_API_KEY: "@elizaos/plugin-together",
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ZAI_API_KEY: "@homunculuslabs/plugin-zai",
  ELIZA_USE_PI_AI: PI_AI_PLUGIN_PACKAGE,
  MILADY_USE_PI_AI: PI_AI_PLUGIN_PACKAGE,
  // ElizaCloud — loaded when API key is present OR cloud is explicitly enabled
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/**
 * Optional feature plugins keyed by feature name.
 *
 * Mappings here support short IDs in allow-lists and feature toggles.
 * Keep this map in sync with optional plugin registration and tests.
 */
export const OPTIONAL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  browser: "@elizaos/plugin-browser",
  vision: "@elizaos/plugin-vision",
  cron: "@elizaos/plugin-cron",
  cua: "@elizaos/plugin-cua",
  computeruse: "@elizaos/plugin-computeruse",
  obsidian: "@elizaos/plugin-obsidian",
  repoprompt: "@elizaos/plugin-repoprompt",
  repoPrompt: "@elizaos/plugin-repoprompt",
  "pi-ai": PI_AI_PLUGIN_PACKAGE,
  piAi: PI_AI_PLUGIN_PACKAGE,
  x402: "@elizaos/plugin-x402",
  "coding-agent": "@elizaos/plugin-agent-orchestrator",
  "streaming-base": "@elizaos/plugin-streaming-base",
  "twitch-streaming": "@elizaos/plugin-twitch-streaming",
  "youtube-streaming": "@elizaos/plugin-youtube-streaming",
  "custom-rtmp": "@elizaos/plugin-custom-rtmp",
  "pumpfun-streaming": "@elizaos/plugin-pumpfun-streaming",
  "x-streaming": "@elizaos/plugin-x-streaming",
  evm: "@elizaos/plugin-evm",
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Collect the set of plugin package names that should be loaded
 * based on config, environment variables, and feature flags.
 */
/** @internal Exported for testing. */
export function collectPluginNames(config: ElizaConfig): Set<string> {
  const shellPluginDisabled = config.features?.shellEnabled === false;
  const localEmbeddingsExplicitlyDisabled = (() => {
    const raw = process.env.ELIZA_DISABLE_LOCAL_EMBEDDINGS;
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  })();
  const cloudMode = config.cloud?.enabled;
  const cloudHasApiKey = Boolean(config.cloud?.apiKey);
  const cloudExplicitlyDisabled = cloudMode === false;
  // Note: this is intentionally broader than the inference-path check in
  // applyCloudConfigToEnv (which requires explicit `enabled: true`).  Here
  // hasApiKey acts as an implicit enable signal so the cloud *plugin* gets
  // loaded for RPC/services (auth, credits, billing) even when inference
  // itself is handled by the user's own keys (BYOK).  The inference and
  // persistence paths gate on `cloud.enabled === true` separately.
  const cloudEffectivelyEnabled =
    cloudMode === true || (!cloudExplicitlyDisabled && cloudHasApiKey);
  // When inferenceMode is "byok" or "local", OR services.inference is false,
  // the user wants their own AI provider keys — cloud stays enabled for
  // RPC/services but does NOT hijack model inference.
  //
  // If the user chose a subscription provider (e.g. anthropic-subscription)
  // during onboarding and never explicitly set inferenceMode, treat that as
  // "byok" — the subscription IS the user's inference choice.
  const hasSubscriptionProvider = Boolean(
    config.agents?.defaults?.subscriptionProvider,
  );
  const explicitInferenceMode = config.cloud?.inferenceMode;
  const cloudInferenceMode =
    explicitInferenceMode ?? (hasSubscriptionProvider ? "byok" : "cloud");
  const cloudInferenceToggle = config.cloud?.services?.inference ?? true;
  const cloudHandlesInference =
    cloudEffectivelyEnabled &&
    cloudInferenceMode === "cloud" &&
    cloudInferenceToggle !== false;
  const configEnv = config.env as
    | (Record<string, unknown> & { vars?: Record<string, unknown> })
    | undefined;
  const configPiAiFlag =
    (configEnv?.vars &&
    typeof configEnv.vars === "object" &&
    !Array.isArray(configEnv.vars)
      ? ((configEnv.vars as Record<string, unknown>).ELIZA_USE_PI_AI ??
        (configEnv.vars as Record<string, unknown>).MILADY_USE_PI_AI)
      : undefined) ??
    configEnv?.ELIZA_USE_PI_AI ??
    configEnv?.MILADY_USE_PI_AI;
  const piAiEnabled =
    isPiAiEnabledFromEnv(process.env) ||
    (typeof configPiAiFlag === "string" &&
      isPiAiEnabledFromEnv({
        ELIZA_USE_PI_AI: configPiAiFlag,
      } as NodeJS.ProcessEnv));

  const pluginEntries = (config.plugins as Record<string, unknown> | undefined)
    ?.entries as Record<string, { enabled?: boolean }> | undefined;

  const isPluginExplicitlyDisabled = (pluginPackageName: string): boolean => {
    const marker = "/plugin-";
    const markerIndex = pluginPackageName.lastIndexOf(marker);
    const pluginId =
      markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    return pluginEntries?.[pluginId]?.enabled === false;
  };

  const providerPluginIdSet = new Set(
    Object.values(PROVIDER_PLUGIN_MAP).map((pluginPackageName) => {
      const marker = "/plugin-";
      const markerIndex = pluginPackageName.lastIndexOf(marker);
      return markerIndex >= 0
        ? pluginPackageName.slice(markerIndex + marker.length)
        : pluginPackageName;
    }),
  );
  const explicitProviderEntries = Object.entries(pluginEntries ?? {}).filter(
    ([pluginId]) => providerPluginIdSet.has(pluginId),
  );
  const hasExplicitEnabledProvider = explicitProviderEntries.some(
    ([, entry]) => entry?.enabled === true,
  );

  // Allow-list entries are additive (extra plugins), not exclusive.
  const allowList = config.plugins?.allow;
  const pluginsToLoad = new Set<string>(CORE_PLUGINS);
  if (localEmbeddingsExplicitlyDisabled) {
    pluginsToLoad.delete("@elizaos/plugin-local-embedding");
  }

  // Allow list is additive — extra plugins on top of auto-detection,
  // not an exclusive whitelist that blocks everything else.
  if (allowList && allowList.length > 0) {
    for (const item of allowList) {
      const pluginName =
        CHANNEL_PLUGIN_MAP[item] ?? OPTIONAL_PLUGIN_MAP[item] ?? item;
      pluginsToLoad.add(pluginName);
    }
  }

  // Connector plugins — load when connector has config entries
  // Prefer config.connectors, fall back to config.channels for backward compatibility
  const connectors =
    config.connectors ??
    ((config as Record<string, unknown>).channels as Record<
      string,
      unknown
    >) ??
    {};
  for (const [channelName, channelConfig] of Object.entries(connectors)) {
    if (channelConfig && typeof channelConfig === "object") {
      const pluginName = CHANNEL_PLUGIN_MAP[channelName];
      if (pluginName) {
        pluginsToLoad.add(pluginName);
      }
    }
  }

  // Model-provider plugins — load when env key is present
  for (const [envKey, pluginName] of Object.entries(PROVIDER_PLUGIN_MAP)) {
    if (envKey === "ELIZA_USE_PI_AI" || envKey === "MILADY_USE_PI_AI") {
      // pi-ai enablement uses dedicated boolean parsing + precedence logic below.
      continue;
    }
    if (
      cloudExplicitlyDisabled &&
      (envKey === "ELIZAOS_CLOUD_API_KEY" || envKey === "ELIZAOS_CLOUD_ENABLED")
    ) {
      continue;
    }
    if (isPluginExplicitlyDisabled(pluginName)) {
      continue;
    }
    if (hasExplicitEnabledProvider) {
      const marker = "/plugin-";
      const markerIndex = pluginName.lastIndexOf(marker);
      const pluginId =
        markerIndex >= 0
          ? pluginName.slice(markerIndex + marker.length)
          : pluginName;
      if (pluginEntries?.[pluginId]?.enabled !== true) {
        continue;
      }
    }
    if (process.env[envKey]?.trim()) {
      pluginsToLoad.add(pluginName);
    }
  }

  const shouldEnablePiAi =
    piAiEnabled && pluginEntries?.["pi-ai"]?.enabled !== false;

  const applyProviderPrecedence = (): void => {
    // Provider precedence:
    // 1) ElizaCloud for inference (when enabled AND inferenceMode is "cloud")
    // 2) pi-ai (when enabled and cloud inference is not active)
    // 3) direct provider plugins (api-key/env based)
    //
    // When inferenceMode is "byok" or "local", cloud stays loaded for
    // RPC/services but direct AI provider plugins are preserved so the
    // user's own API keys (e.g. Anthropic) handle model inference.
    if (cloudEffectivelyEnabled) {
      pluginsToLoad.add("@elizaos/plugin-elizacloud");

      if (cloudHandlesInference) {
        // Cloud handles ALL model calls — remove direct AI provider plugins.
        const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
        directProviders.delete("@elizaos/plugin-elizacloud");
        for (const p of directProviders) {
          pluginsToLoad.delete(p);
        }
        return;
      }
      // inferenceMode is "byok" or "local" — keep direct provider plugins.
      // Cloud plugin stays loaded for non-inference cloud services (RPC, media, etc.)
      // Pi-ai takes priority over direct providers when cloud inference is disabled.
      if (shouldEnablePiAi) {
        pluginsToLoad.add(PI_AI_PLUGIN_PACKAGE);
        // Remove direct provider plugins — pi-ai handles inference selection.
        const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
        directProviders.delete(PI_AI_PLUGIN_PACKAGE);
        directProviders.delete("@elizaos/plugin-elizacloud");
        for (const p of directProviders) {
          pluginsToLoad.delete(p);
        }
      }
      return;
    }

    if (shouldEnablePiAi) {
      pluginsToLoad.add(PI_AI_PLUGIN_PACKAGE);

      // When pi-ai is active, remove direct provider plugins + cloud plugin.
      // pi-ai performs the upstream provider selection itself.
      const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
      directProviders.delete(PI_AI_PLUGIN_PACKAGE);
      for (const p of directProviders) {
        pluginsToLoad.delete(p);
      }
      pluginsToLoad.delete("@elizaos/plugin-elizacloud");
      return;
    }

    if (cloudExplicitlyDisabled) {
      // Cloud was explicitly disabled — remove elizacloud even though it's
      // in CORE_PLUGINS, so it cannot intercept model calls.
      pluginsToLoad.delete("@elizaos/plugin-elizacloud");
    }
  };

  // Apply once before additive plugin-entry/feature paths.
  applyProviderPrecedence();

  // Optional feature plugins from config.plugins.entries
  const pluginsConfig = config.plugins as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (pluginsConfig?.entries) {
    for (const [key, entry] of Object.entries(pluginsConfig.entries)) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).enabled !== false
      ) {
        // Connector keys (telegram, discord, etc.) must use CHANNEL_PLUGIN_MAP
        // so the correct variant loads.
        const pluginName =
          CHANNEL_PLUGIN_MAP[key] ??
          OPTIONAL_PLUGIN_MAP[key] ??
          (key.includes("/") ? key : `@elizaos/plugin-${key}`);
        pluginsToLoad.add(pluginName);
      }
    }
  }

  // Feature flags (config.features)
  const features = config.features;
  if (features && typeof features === "object") {
    for (const [featureName, featureValue] of Object.entries(features)) {
      const isEnabled =
        featureValue === true ||
        (typeof featureValue === "object" &&
          featureValue !== null &&
          (featureValue as Record<string, unknown>).enabled !== false);
      if (isEnabled) {
        const pluginName = OPTIONAL_PLUGIN_MAP[featureName];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
        }
      }
    }
  }

  // x402 plugin — auto-load when config section enabled
  if (config.x402?.enabled) {
    pluginsToLoad.add("@elizaos/plugin-x402");
  }

  // Opinion plugin — auto-load when API key is present.
  // NOT in PROVIDER_PLUGIN_MAP because it is a feature plugin, not a model
  // provider, and would be incorrectly removed during provider precedence.
  if (process.env.OPINION_API_KEY?.trim()) {
    pluginsToLoad.add("@elizaos/plugin-opinion");
  }

  // EVM wallet plugin — auto-load when private key is available.
  // NOT in PROVIDER_PLUGIN_MAP because it is a feature plugin (wallet/DeFi),
  // not a model provider, and would be incorrectly removed during provider
  // precedence resolution.
  if (process.env.EVM_PRIVATE_KEY?.trim()) {
    pluginsToLoad.add("@elizaos/plugin-evm");
  }

  // User-installed plugins from config.plugins.installs
  // These are plugins that were installed via the plugin-manager at runtime
  // and tracked in eliza.json so they persist across restarts.
  const installs = config.plugins?.installs;
  if (installs && typeof installs === "object") {
    for (const [packageName, record] of Object.entries(installs)) {
      if (record && typeof record === "object") {
        pluginsToLoad.add(packageName);
      }
    }
  }

  // Re-apply provider precedence so later additive paths (entries, features,
  // installs) cannot accidentally re-introduce suppressed providers.
  applyProviderPrecedence();

  // Enforce feature gating last so allow-list entries cannot bypass it.
  if (shellPluginDisabled) {
    pluginsToLoad.delete("@elizaos/plugin-shell");
  }
  if (isPluginExplicitlyDisabled("@elizaos/plugin-agent-orchestrator")) {
    pluginsToLoad.delete("@elizaos/plugin-agent-orchestrator");
  }

  return pluginsToLoad;
}
