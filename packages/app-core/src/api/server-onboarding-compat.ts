/**
 * Onboarding compat helpers — API key persistence, onboarding defaults,
 * cloud-mode detection, and cloud-provisioned container detection.
 */
import { logger, stringToUuid } from "@elizaos/core";
import type {
  OnboardingConnection,
  OnboardingLocalProviderId,
} from "@miladyai/agent/contracts/onboarding";
import { normalizeOnboardingProviderId } from "@miladyai/agent/contracts/onboarding";
import {
  getDefaultStylePreset,
  getStylePresets,
  normalizeCharacterLanguage,
} from "@miladyai/shared/onboarding-presets";
import { loadElizaConfig, saveElizaConfig } from "../config/config";
import { PREMADE_VOICES } from "../voice/types";
import {
  applyOnboardingConnectionConfig,
  mergeOnboardingConnectionWithExisting,
  resolveExistingOnboardingConnection,
} from "./provider-switch-config";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve the API token using Milady-first priority. */
function getCompatApiToken(): string | null {
  const token =
    process.env.MILADY_API_TOKEN?.trim() ?? process.env.ELIZA_API_TOKEN?.trim();
  return token ? token : null;
}

// ---------------------------------------------------------------------------
// Onboarding API key persistence
// ---------------------------------------------------------------------------

const ONBOARDING_PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  grok: "XAI_API_KEY",
  xai: "XAI_API_KEY",
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  "google-genai": "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  together: "TOGETHER_API_KEY",
  zai: "ZAI_API_KEY",
};

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const DEFAULT_ELEVENLABS_TTS_MODEL = "eleven_flash_v2_5";
const ELEVENLABS_VOICE_ID_BY_PRESET = new Map(
  PREMADE_VOICES.map((voice) => [voice.id, voice.voiceId]),
);

function resolveCompatOnboardingStyle(
  body: Record<string, unknown>,
  language: string,
) {
  const presets = getStylePresets(language);
  const requestedPresetId = trimToUndefined(body.presetId);
  if (requestedPresetId) {
    const byId = presets.find((preset) => preset.id === requestedPresetId);
    if (byId) return byId;
  }

  if (
    typeof body.avatarIndex === "number" &&
    Number.isFinite(body.avatarIndex)
  ) {
    const byAvatar = presets.find(
      (preset) => preset.avatarIndex === Number(body.avatarIndex),
    );
    if (byAvatar) return byAvatar;
  }

  const requestedName = trimToUndefined(body.name);
  if (requestedName) {
    const byName = presets.find((preset) => preset.name === requestedName);
    if (byName) return byName;
  }

  return getDefaultStylePreset(language);
}

function normalizeOnboardingConnection(
  body: Record<string, unknown>,
): OnboardingConnection | null {
  const connection =
    body.connection && typeof body.connection === "object"
      ? (body.connection as Record<string, unknown>)
      : null;
  if (!connection) {
    return null;
  }

  if (connection.kind === "cloud-managed") {
    return {
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: trimToUndefined(connection.apiKey),
      smallModel: trimToUndefined(connection.smallModel),
      largeModel: trimToUndefined(connection.largeModel),
    };
  }

  if (connection.kind === "local-provider") {
    const provider = normalizeOnboardingProviderId(connection.provider);
    if (!provider || provider === "elizacloud") {
      return null;
    }
    return {
      kind: "local-provider",
      provider: provider as OnboardingLocalProviderId,
      apiKey: trimToUndefined(connection.apiKey),
      primaryModel: trimToUndefined(connection.primaryModel),
    };
  }

  if (connection.kind === "remote-provider") {
    const remoteApiBase = trimToUndefined(connection.remoteApiBase);
    const provider = normalizeOnboardingProviderId(connection.provider);
    if (!remoteApiBase) {
      return null;
    }
    return {
      kind: "remote-provider",
      remoteApiBase,
      remoteAccessToken: trimToUndefined(connection.remoteAccessToken),
      provider: provider && provider !== "elizacloud" ? provider : undefined,
      apiKey: trimToUndefined(connection.apiKey),
      primaryModel: trimToUndefined(connection.primaryModel),
    };
  }

  return null;
}

function resolvePersistedOnboardingConnection(
  body: Record<string, unknown>,
): OnboardingConnection | null {
  const nextConnection = normalizeOnboardingConnection(body);
  if (!nextConnection) {
    return null;
  }

  const config = loadElizaConfig();
  const existingConnection = resolveExistingOnboardingConnection(
    config as Record<string, unknown>,
  );
  return mergeOnboardingConnectionWithExisting(
    nextConnection,
    existingConnection,
  );
}

/**
 * Extract `connection.apiKey` from an onboarding request body and persist it
 * to eliza.json + process.env. Returns the env key name if persisted, or null.
 */
export async function extractAndPersistOnboardingApiKey(
  body: Record<string, unknown>,
): Promise<string | null> {
  const persistedConnection = resolvePersistedOnboardingConnection(body);
  if (!persistedConnection) {
    return null;
  }

  if (persistedConnection.kind === "local-provider") {
    const envKey = ONBOARDING_PROVIDER_ENV_KEYS[persistedConnection.provider];
    if (envKey && !persistedConnection.apiKey) {
      return null;
    }
  }

  const config = loadElizaConfig();
  await applyOnboardingConnectionConfig(config, persistedConnection);
  saveElizaConfig(config);

  if (persistedConnection.kind !== "local-provider") {
    return null;
  }

  const envKey = ONBOARDING_PROVIDER_ENV_KEYS[persistedConnection.provider];
  if (!envKey || !persistedConnection.apiKey) {
    return null;
  }

  logger.info(`[onboarding] Persisted ${envKey} from connection.apiKey`);
  return envKey;
}

export function persistCompatOnboardingDefaults(
  body: Record<string, unknown>,
): string | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return null;
  }

  const config = loadElizaConfig();
  const language = normalizeCharacterLanguage(body.language);
  const stylePreset = resolveCompatOnboardingStyle(body, language);
  if (!config.agents || typeof config.agents !== "object") {
    (config as Record<string, unknown>).agents = {};
  }
  const agents = config.agents as NonNullable<typeof config.agents>;
  if (!agents.defaults || typeof agents.defaults !== "object") {
    agents.defaults = {};
  }

  const adminEntityId = stringToUuid(`${name}-admin-entity`);
  agents.defaults.adminEntityId = adminEntityId;

  if (!Array.isArray(agents.list) || agents.list.length === 0) {
    (agents as Record<string, unknown>).list = [{ id: "main", default: true }];
  }
  const agentEntry = (agents.list as Record<string, unknown>[])[0];
  agentEntry.name = name;
  if (Array.isArray(body.bio)) {
    agentEntry.bio = body.bio;
  }
  if (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) {
    agentEntry.system = body.systemPrompt.trim();
  }
  if (body.style && typeof body.style === "object") {
    agentEntry.style = body.style;
  }
  if (Array.isArray(body.adjectives)) {
    agentEntry.adjectives = body.adjectives;
  }
  if (Array.isArray(body.topics)) {
    agentEntry.topics = body.topics;
  }
  if (Array.isArray(body.postExamples)) {
    agentEntry.postExamples = body.postExamples;
  }
  if (Array.isArray(body.messageExamples)) {
    agentEntry.messageExamples = body.messageExamples;
  }

  if (!config.ui || typeof config.ui !== "object") {
    (config as Record<string, unknown>).ui = {};
  }
  const ui = config.ui as Record<string, unknown>;
  ui.assistant = {
    ...(ui.assistant && typeof ui.assistant === "object"
      ? (ui.assistant as Record<string, unknown>)
      : {}),
    name,
  };
  ui.language = language;
  if (
    typeof body.avatarIndex === "number" &&
    Number.isFinite(body.avatarIndex)
  ) {
    ui.avatarIndex = Number(body.avatarIndex);
  } else if (typeof stylePreset?.avatarIndex === "number") {
    ui.avatarIndex = stylePreset.avatarIndex;
  }
  if (trimToUndefined(body.presetId)) {
    ui.presetId = trimToUndefined(body.presetId);
  } else if (stylePreset?.id) {
    ui.presetId = stylePreset.id;
  }

  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voicePresetId = stylePreset?.voicePresetId?.trim();
  const voiceId = voicePresetId
    ? ELEVENLABS_VOICE_ID_BY_PRESET.get(voicePresetId)
    : undefined;
  if (elevenLabsApiKey && voiceId) {
    if (!config.messages || typeof config.messages !== "object") {
      (config as Record<string, unknown>).messages = {};
    }
    const messages = config.messages as Record<string, unknown>;
    const existingTts =
      messages.tts && typeof messages.tts === "object"
        ? (messages.tts as Record<string, unknown>)
        : {};
    const existingElevenlabs =
      existingTts.elevenlabs && typeof existingTts.elevenlabs === "object"
        ? (existingTts.elevenlabs as Record<string, unknown>)
        : {};

    messages.tts = {
      ...existingTts,
      provider: "elevenlabs",
      elevenlabs: {
        ...existingElevenlabs,
        voiceId,
        modelId:
          typeof existingElevenlabs.modelId === "string" &&
          existingElevenlabs.modelId.trim()
            ? existingElevenlabs.modelId.trim()
            : DEFAULT_ELEVENLABS_TTS_MODEL,
      },
    };
  }

  saveElizaConfig(config);
  return adminEntityId;
}

export function deriveCompatOnboardingReplayBody(
  body: Record<string, unknown>,
): {
  isCloudMode: boolean;
  replayBody:
    | (Record<string, unknown> & { runMode: "cloud" })
    | Record<string, unknown>;
} {
  const connection = resolvePersistedOnboardingConnection(body);
  const isCloudMode =
    body.runMode === "cloud" || connection?.kind === "cloud-managed";

  if (connection?.kind === "cloud-managed") {
    return {
      isCloudMode: true,
      replayBody: {
        ...body,
        runMode: "cloud",
        cloudProvider: "elizacloud",
        ...(connection.apiKey ? { providerApiKey: connection.apiKey } : {}),
        ...(connection.smallModel ? { smallModel: connection.smallModel } : {}),
        ...(connection.largeModel ? { largeModel: connection.largeModel } : {}),
      },
    };
  }

  if (connection?.kind === "local-provider") {
    return {
      isCloudMode: false,
      replayBody: {
        ...body,
        runMode: "local",
        provider: connection.provider,
        ...(connection.apiKey ? { providerApiKey: connection.apiKey } : {}),
        ...(connection.primaryModel
          ? { primaryModel: connection.primaryModel }
          : {}),
      },
    };
  }

  return {
    isCloudMode,
    replayBody:
      isCloudMode && body.runMode !== "cloud"
        ? { ...body, runMode: "cloud" as const }
        : body,
  };
}

/**
 * Check if this is a cloud-provisioned container.
 *
 * Cloud-provisioned containers (e.g., Eliza Cloud, enterprise deployments) skip
 * pairing and onboarding since the platform handles setup and authentication.
 *
 * Security: The bypass ONLY activates when BOTH conditions are met:
 * 1. MILADY_CLOUD_PROVISIONED=1 (or ELIZA_CLOUD_PROVISIONED=1)
 * 2. A platform-managed token is configured (`STEWARD_AGENT_TOKEN`, with
 *    compat-token fallback for older environments)
 *
 * This ensures that only platform-managed containers with proper auth can skip
 * onboarding. A container with just CLOUD_PROVISIONED=1 but no platform token
 * would be unauthenticated and must go through normal onboarding.
 */
export function isCloudProvisioned(): boolean {
  const hasCloudFlag =
    process.env.MILADY_CLOUD_PROVISIONED === "1" ||
    process.env.ELIZA_CLOUD_PROVISIONED === "1";

  const hasPlatformToken = Boolean(
    process.env.STEWARD_AGENT_TOKEN?.trim() || getCompatApiToken(),
  );

  return hasCloudFlag && hasPlatformToken;
}
