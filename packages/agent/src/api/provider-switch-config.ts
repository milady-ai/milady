import {
  applySubscriptionCredentials,
  deleteCredentials,
} from "@miladyai/agent/auth";
import { SUBSCRIPTION_PROVIDER_MAP } from "../auth/types";
import type { ElizaConfig } from "../config/types.eliza";
import {
  getOnboardingProviderOption,
  getOnboardingProviderSignalEnvKeys,
  getStoredOnboardingProviderId,
  inferCompatibilityOnboardingConnection,
  inferOnboardingConnectionFromConfig,
  isCloudManagedConnection,
  isLocalProviderConnection,
  isRemoteProviderConnection,
  normalizeOnboardingProviderId,
  normalizePersistedOnboardingConnection,
  type OnboardingConnection,
  type OnboardingLocalProviderId,
  stripOnboardingConnectionSecrets,
} from "../contracts/onboarding";

type MutableElizaConfig = Partial<ElizaConfig> & {
  cloud?: Record<string, unknown>;
  models?: Record<string, unknown>;
  wallet?: { rpcProviders?: Record<string, string> };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimToUndefined(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function ensureEnv(config: MutableElizaConfig): Record<string, unknown> {
  config.env ??= {};
  return config.env as Record<string, unknown>;
}

function ensureEnvVars(config: MutableElizaConfig): Record<string, string> {
  const env = ensureEnv(config);
  const existing = asRecord(env.vars);
  if (existing) {
    return existing as Record<string, string>;
  }
  const next: Record<string, string> = {};
  env.vars = next;
  return next;
}

function ensureDefaults(
  config: MutableElizaConfig,
): NonNullable<NonNullable<ElizaConfig["agents"]>["defaults"]> {
  config.agents ??= {};
  config.agents.defaults ??= {};
  return config.agents.defaults;
}

function ensureCloud(config: MutableElizaConfig): Record<string, unknown> {
  config.cloud ??= {};
  return config.cloud;
}

function ensureModels(config: MutableElizaConfig): Record<string, unknown> {
  config.models ??= {};
  return config.models;
}

function pruneEnv(config: MutableElizaConfig): void {
  const env = asRecord(config.env);
  if (!env) {
    return;
  }
  const vars = asRecord(env.vars);
  if (vars && Object.keys(vars).length === 0) {
    delete env.vars;
  }

  const envKeys = Object.keys(env).filter((key) => key !== "shellEnv");
  const hasShellEnv = Boolean(env.shellEnv);
  if (envKeys.length === 0 && !hasShellEnv) {
    delete config.env;
  }
}

function setEnvValue(
  config: MutableElizaConfig,
  key: string,
  value: string | undefined,
): void {
  const env = ensureEnv(config);
  const vars = ensureEnvVars(config);
  if (value) {
    env[key] = value;
    vars[key] = value;
    process.env[key] = value;
    return;
  }
  delete env[key];
  delete vars[key];
  delete process.env[key];
  pruneEnv(config);
}

function setPrimaryModel(
  config: MutableElizaConfig,
  primaryModel: string | undefined,
): void {
  const defaults = ensureDefaults(config);
  if (!primaryModel) {
    if (defaults.model) {
      delete defaults.model.primary;
    }
    return;
  }
  defaults.model = { ...defaults.model, primary: primaryModel };
}

function clearPiAiFlag(config: MutableElizaConfig): void {
  for (const key of ["ELIZA_USE_PI_AI", "MILADY_USE_PI_AI"] as const) {
    clearPersistedEnvValue(config, key);
    delete process.env[key];
  }
}

function clearPersistedEnvValue(config: MutableElizaConfig, key: string): void {
  const env = asRecord(config.env);
  const vars = asRecord(env?.vars);

  if (vars) {
    delete vars[key];
    if (Object.keys(vars).length === 0 && env) {
      delete env.vars;
    }
  }

  if (env) {
    delete env[key];
    if (Object.keys(env).length === 0) {
      delete config.env;
    }
  }
}

function clearCloudModelSelections(config: MutableElizaConfig): void {
  const models = asRecord(config.models);
  if (!models) {
    return;
  }
  delete models.small;
  delete models.large;
  if (Object.keys(models).length === 0) {
    delete config.models;
  }
}

function clearRemoteProviderConfig(config: MutableElizaConfig): void {
  const cloud = asRecord(config.cloud);
  if (!cloud) {
    return;
  }
  delete cloud.remoteApiBase;
  delete cloud.remoteAccessToken;
  if (cloud.provider === "remote") {
    delete cloud.provider;
  }
}

// Config-only; does not touch process.env OPENAI_/ANTHROPIC_ (see clearElizaCloudCliProxyEnv).
function disableCloudInference(config: MutableElizaConfig): void {
  const cloud = ensureCloud(config);
  cloud.enabled = false;
  cloud.inferenceMode = "byok";
  cloud.runtime = "local";

  const services = asRecord(cloud.services) ?? {};
  services.inference = false;
  cloud.services = services;
}

// Updates persisted config + ELIZAOS_* for Milady runtime. Does not set OPENAI_/ANTHROPIC_
// proxy env; POST /api/provider/switch does that in server.ts when elizacloud + apiKey.
function enableCloudInference(config: MutableElizaConfig): void {
  const cloud = ensureCloud(config);
  cloud.enabled = true;
  cloud.provider = "elizacloud";
  cloud.inferenceMode = "cloud";
  cloud.runtime = "cloud";

  const services = asRecord(cloud.services) ?? {};
  services.inference = true;
  cloud.services = services;
}

function persistConnectionSelection(
  config: MutableElizaConfig,
  connection: OnboardingConnection | null,
): void {
  if (!connection) {
    delete config.connection;
    return;
  }
  config.connection = stripOnboardingConnectionSecrets(connection);
}

// Remove ElizaCloud CLI proxy endpoints from process.env and the API keys that server.ts
// pairs with them (same cloud key for both SDKs). Only clears a key when its matching
// base URL pointed at ElizaCloud—so local-provider switches that never set those URLs
// keep multi-key preservation (provider-switch.e2e).
function clearElizaCloudCliProxyEnv(): void {
  const pairs = [
    ["OPENAI_BASE_URL", "OPENAI_API_KEY"],
    ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY"],
  ] as const;
  for (const [baseKey, apiKey] of pairs) {
    const v = process.env[baseKey];
    if (v && /elizacloud/i.test(v)) {
      delete process.env[baseKey];
      delete process.env[apiKey];
    }
  }
}
function applyLocalProviderCapabilities(
  config: MutableElizaConfig,
  connection: Extract<OnboardingConnection, { kind: "local-provider" }>,
): Promise<void> {
  const normalizedProvider = normalizeOnboardingProviderId(connection.provider);
  if (!normalizedProvider || normalizedProvider === "elizacloud") {
    return Promise.resolve();
  }

  disableCloudInference(config);
  clearElizaCloudCliProxyEnv();
  clearRemoteProviderConfig(config);
  clearCloudModelSelections(config);

  clearSubscriptionProviderConfig(config);
  if (normalizedProvider !== "pi-ai") {
    clearPiAiFlag(config);
  }

  const storedProviderId = getStoredOnboardingProviderId(normalizedProvider);
  if (
    storedProviderId === "anthropic-subscription" ||
    storedProviderId === "openai-codex"
  ) {
    applySubscriptionProviderConfig(config, storedProviderId);

    const setupToken =
      storedProviderId === "anthropic-subscription"
        ? trimToUndefined(connection.apiKey)
        : undefined;

    if (setupToken?.startsWith("sk-ant-")) {
      setEnvValue(config, "ANTHROPIC_API_KEY", setupToken);
      return Promise.resolve();
    }

    return applySubscriptionCredentials(config);
  }

  if (normalizedProvider === "pi-ai") {
    setEnvValue(config, "ELIZA_USE_PI_AI", "1");
  }

  const providerOption = getOnboardingProviderOption(normalizedProvider);
  if (providerOption?.envKey) {
    const apiKey = trimToUndefined(connection.apiKey);
    if (apiKey) {
      setEnvValue(config, providerOption.envKey, apiKey);
    }
  } else {
    for (const envKey of getOnboardingProviderSignalEnvKeys(
      normalizedProvider,
    )) {
      const value = trimToUndefined(connection.apiKey);
      if (value) {
        setEnvValue(config, envKey, value);
      }
    }
  }

  // Set the primary model plugin so the runtime boosts its priority.
  // If the user didn't pick a specific model, resolve from the provider's
  // plugin name so the correct provider wins the TEXT_SMALL/TEXT_LARGE
  // handler registration.
  const explicitPrimary = trimToUndefined(connection.primaryModel);
  const resolvedPrimary =
    explicitPrimary ?? providerOption?.pluginName ?? undefined;
  setPrimaryModel(config, resolvedPrimary);

  // Set provider-specific default model names so TEXT_SMALL and TEXT_LARGE
  // resolve to sensible models even when the user didn't override them.
  applyDefaultModelNames(config, normalizedProvider);

  return Promise.resolve();
}

/** Default small/large model names by provider family. */
const PROVIDER_DEFAULT_MODELS: Record<
  string,
  { smallKey: string; smallVal: string; largeKey: string; largeVal: string }
> = {
  anthropic: {
    smallKey: "ANTHROPIC_SMALL_MODEL",
    smallVal: "claude-haiku-4-5-20251001",
    largeKey: "ANTHROPIC_LARGE_MODEL",
    largeVal: "claude-sonnet-4-6",
  },
  openai: {
    smallKey: "OPENAI_SMALL_MODEL",
    smallVal: "gpt-5-mini",
    largeKey: "OPENAI_LARGE_MODEL",
    largeVal: "gpt-5",
  },
  google: {
    smallKey: "GOOGLE_SMALL_MODEL",
    smallVal: "gemini-2.0-flash-001",
    largeKey: "GOOGLE_LARGE_MODEL",
    largeVal: "gemini-2.5-pro-preview-03-25",
  },
};

function applyDefaultModelNames(
  config: MutableElizaConfig,
  provider: string,
): void {
  const defaults = PROVIDER_DEFAULT_MODELS[provider];
  if (!defaults) return;
  // Only set if not already configured — don't clobber user overrides
  if (!process.env[defaults.smallKey]) {
    setEnvValue(config, defaults.smallKey, defaults.smallVal);
  }
  if (!process.env[defaults.largeKey]) {
    setEnvValue(config, defaults.largeKey, defaults.largeVal);
  }
}

/**
 * Apply subscription provider configuration to the config object.
 *
 * Sets `agents.defaults.subscriptionProvider` and `agents.defaults.model.primary`
 * so the runtime auto-detects the correct provider on restart.
 *
 * Mutates `config` in place.
 */
export function applySubscriptionProviderConfig(
  config: Partial<ElizaConfig>,
  provider: string,
): void {
  config.agents ??= {};
  config.agents.defaults ??= {};
  const defaults = config.agents.defaults;

  const subscriptionKey =
    provider === "openai-subscription" ? "openai-codex" : provider;
  const modelProvider =
    SUBSCRIPTION_PROVIDER_MAP[
      subscriptionKey as keyof typeof SUBSCRIPTION_PROVIDER_MAP
    ];

  if (modelProvider) {
    defaults.subscriptionProvider = subscriptionKey;
    defaults.model = { ...defaults.model, primary: modelProvider };
  }
}

/**
 * Clear subscription provider configuration from the config object.
 *
 * Removes `agents.defaults.subscriptionProvider` so the runtime
 * doesn't try to auto-detect a subscription provider on restart.
 *
 * Mutates `config` in place.
 */
export function clearSubscriptionProviderConfig(
  config: Partial<ElizaConfig>,
): void {
  config.agents ??= {};
  config.agents.defaults ??= {};
  delete config.agents.defaults.subscriptionProvider;
}

/**
 * Clear persisted onboarding state that should force the UI back through the
 * onboarding flow on the next load/reset.
 */
export function clearPersistedOnboardingConfig(
  config: MutableElizaConfig,
): void {
  if (config.meta && typeof config.meta === "object") {
    delete (config.meta as Record<string, unknown>).onboardingComplete;
  }

  config.agents = { list: [] };

  if (config.cloud && typeof config.cloud === "object") {
    config.cloud = {};
  }

  const models = asRecord(config.models);
  if (models) {
    delete models.small;
    delete models.large;
    if (Object.keys(models).length === 0) {
      delete config.models;
    }
  }

  // Clear voice settings so presets apply their correct voice on re-onboarding.
  const messages = asRecord(config.messages);
  if (messages) {
    delete messages.tts;
    if (Object.keys(messages).length === 0) {
      delete config.messages;
    }
  }

  // Clear UI state (avatar, preset selection) so the full character resets.
  // Without this, the avatar survives a reset but the voice doesn't,
  // causing mismatched character state (e.g. male preset with female voice).
  delete config.ui;

  delete config.connection;

  const signalProviders = [
    "anthropic",
    "anthropic-subscription",
    "deepseek",
    "gemini",
    "grok",
    "groq",
    "mistral",
    "ollama",
    "openai",
    "openai-subscription",
    "openrouter",
    "pi-ai",
    "together",
    "zai",
  ] as const satisfies readonly OnboardingLocalProviderId[];

  for (const providerId of signalProviders) {
    for (const envKey of getOnboardingProviderSignalEnvKeys(providerId)) {
      clearPersistedEnvValue(config, envKey);
      delete process.env[envKey];
    }
  }
  clearPiAiFlag(config);

  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.ELIZAOS_CLOUD_ENABLED;
  deleteCredentials("anthropic-subscription");
  deleteCredentials("openai-codex");
}

export function createProviderSwitchConnection(args: {
  provider: string;
  apiKey?: string;
  primaryModel?: string;
}): OnboardingConnection | null {
  const provider = normalizeOnboardingProviderId(args.provider);
  if (!provider) {
    return null;
  }

  if (provider === "elizacloud") {
    return {
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
    };
  }

  return {
    kind: "local-provider",
    provider,
    apiKey: trimToUndefined(args.apiKey),
    primaryModel: trimToUndefined(args.primaryModel),
  };
}

export function resolveExistingOnboardingConnection(
  config: Record<string, unknown> | null | undefined,
): OnboardingConnection | null {
  return inferOnboardingConnectionFromConfig(config);
}

export function mergeOnboardingConnectionWithExisting(
  nextConnection: OnboardingConnection,
  existingConnection: OnboardingConnection | null | undefined,
): OnboardingConnection {
  const normalizedNext = normalizePersistedOnboardingConnection(nextConnection);
  if (!normalizedNext) {
    return nextConnection;
  }

  if (!existingConnection || existingConnection.kind !== normalizedNext.kind) {
    return normalizedNext;
  }

  if (normalizedNext.kind === "cloud-managed") {
    if (
      !isCloudManagedConnection(existingConnection) ||
      existingConnection.cloudProvider !== normalizedNext.cloudProvider
    ) {
      return normalizedNext;
    }
    return {
      ...existingConnection,
      ...normalizedNext,
      apiKey: normalizedNext.apiKey ?? existingConnection.apiKey,
      smallModel: normalizedNext.smallModel ?? existingConnection.smallModel,
      largeModel: normalizedNext.largeModel ?? existingConnection.largeModel,
    };
  }

  if (normalizedNext.kind === "local-provider") {
    if (
      !isLocalProviderConnection(existingConnection) ||
      existingConnection.provider !== normalizedNext.provider
    ) {
      return normalizedNext;
    }
    return {
      ...existingConnection,
      ...normalizedNext,
      apiKey: normalizedNext.apiKey ?? existingConnection.apiKey,
      primaryModel:
        normalizedNext.primaryModel ?? existingConnection.primaryModel,
    };
  }

  if (!isRemoteProviderConnection(existingConnection)) {
    return normalizedNext;
  }

  return {
    ...existingConnection,
    ...normalizedNext,
    remoteAccessToken:
      normalizedNext.remoteAccessToken ?? existingConnection.remoteAccessToken,
    apiKey: normalizedNext.apiKey ?? existingConnection.apiKey,
    primaryModel:
      normalizedNext.primaryModel ?? existingConnection.primaryModel,
  };
}

export function reconcilePersistedOnboardingConnection(
  config: MutableElizaConfig,
): OnboardingConnection | null {
  const resolved = inferCompatibilityOnboardingConnection(config);
  persistConnectionSelection(config, resolved);
  return resolved;
}

export async function applyOnboardingConnectionConfig(
  config: MutableElizaConfig,
  connection: OnboardingConnection,
): Promise<void> {
  const normalizedConnection =
    normalizePersistedOnboardingConnection(connection);
  if (!normalizedConnection) {
    throw new Error("Invalid onboarding connection");
  }

  persistConnectionSelection(config, normalizedConnection);

  if (normalizedConnection.kind === "cloud-managed") {
    enableCloudInference(config);
    clearRemoteProviderConfig(config);

    const cloud = ensureCloud(config);
    const models = ensureModels(config);
    const apiKey = trimToUndefined(normalizedConnection.apiKey);
    if (apiKey) {
      cloud.apiKey = apiKey;
      process.env.ELIZAOS_CLOUD_API_KEY = apiKey;
    }
    if (normalizedConnection.smallModel) {
      models.small = normalizedConnection.smallModel;
    }
    if (normalizedConnection.largeModel) {
      models.large = normalizedConnection.largeModel;
    }

    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    clearSubscriptionProviderConfig(config);
    clearPiAiFlag(config);
    return;
  }

  delete process.env.ELIZAOS_CLOUD_ENABLED;
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.ELIZAOS_CLOUD_BASE_URL;
  delete process.env.ELIZAOS_CLOUD_SMALL_MODEL;
  delete process.env.ELIZAOS_CLOUD_LARGE_MODEL;

  if (normalizedConnection.kind === "remote-provider") {
    clearSubscriptionProviderConfig(config);
    clearPiAiFlag(config);
    clearCloudModelSelections(config);

    const cloud = ensureCloud(config);
    cloud.enabled = true;
    cloud.provider = "remote";
    cloud.runtime = "cloud";
    cloud.remoteApiBase = normalizedConnection.remoteApiBase;
    if (normalizedConnection.remoteAccessToken) {
      cloud.remoteAccessToken = normalizedConnection.remoteAccessToken;
    }

    return;
  }

  await applyLocalProviderCapabilities(config, normalizedConnection);
}
