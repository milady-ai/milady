/**
 * Onboarding compat helpers — API key persistence, onboarding defaults,
 * cloud-mode detection, and cloud-provisioned container detection.
 */
import { logger, stringToUuid } from "@elizaos/core";
import { loadElizaConfig, saveElizaConfig } from "../config/config";

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

/**
 * Extract `connection.apiKey` from an onboarding request body and persist it
 * to eliza.json + process.env. Returns the env key name if persisted, or null.
 */
export function extractAndPersistOnboardingApiKey(
  body: Record<string, unknown>,
): string | null {
  const connection = body.connection as Record<string, unknown> | undefined;
  if (
    !connection ||
    typeof connection.provider !== "string" ||
    typeof connection.apiKey !== "string" ||
    connection.apiKey.trim().length === 0
  ) {
    return null;
  }

  const envKey = ONBOARDING_PROVIDER_ENV_KEYS[connection.provider];
  if (!envKey) {
    return null;
  }

  const config = loadElizaConfig();
  if (!config.env || typeof config.env !== "object") {
    (config as Record<string, unknown>).env = {};
  }
  (config.env as Record<string, string>)[envKey] = connection.apiKey as string;
  (config as Record<string, unknown>).subscriptionProvider =
    connection.provider;
  saveElizaConfig(config);
  process.env[envKey] = connection.apiKey as string;
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
  const connection = body.connection as Record<string, unknown> | undefined;
  const isCloudMode =
    body.runMode === "cloud" ||
    (connection !== null &&
      typeof connection === "object" &&
      connection.kind === "cloud-managed");

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
 * 2. MILADY_API_TOKEN (or ELIZA_API_TOKEN) is configured
 *
 * This ensures that only platform-managed containers with proper auth can skip
 * onboarding. A container with just CLOUD_PROVISIONED=1 but no token would be
 * unauthenticated and must go through normal onboarding.
 */
export function isCloudProvisioned(): boolean {
  const hasCloudFlag =
    process.env.MILADY_CLOUD_PROVISIONED === "1" ||
    process.env.ELIZA_CLOUD_PROVISIONED === "1";

  // Security guard: only bypass when the platform has also set an API token
  const hasApiToken = Boolean(getCompatApiToken());

  return hasCloudFlag && hasApiToken;
}
