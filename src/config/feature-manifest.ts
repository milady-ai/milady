/**
 * Feature Manifest — single source of truth for feature → tier mapping.
 *
 * Every feature that can be gated by a user plan/tier is listed here.
 * The manifest is consumed by plugin-auto-enable (server-side) and the
 * /api/features endpoint (client-side) to decide what is available.
 */

export type FeatureTier = "free" | "premium" | "enterprise";
export type FeatureCategory =
  | "execution"
  | "ai"
  | "media"
  | "integration"
  | "infrastructure"
  | "advanced";

export interface FeatureManifestEntry {
  id: string;
  pluginName: string;
  displayName: string;
  description: string;
  requiredTier: FeatureTier;
  category: FeatureCategory;
}

export const FEATURE_MANIFEST: readonly FeatureManifestEntry[] = [
  // Free tier
  {
    id: "shell",
    pluginName: "@milady/plugin-claude-bridge",
    displayName: "Shell Access",
    description: "Terminal command execution",
    requiredTier: "free",
    category: "execution",
  },
  {
    id: "browser",
    pluginName: "@elizaos/plugin-browser",
    displayName: "Browser",
    description: "Automated web browsing",
    requiredTier: "free",
    category: "execution",
  },
  {
    id: "vision",
    pluginName: "@elizaos/plugin-vision",
    displayName: "Vision",
    description: "Screen capture and visual analysis",
    requiredTier: "free",
    category: "ai",
  },
  {
    id: "ollama",
    pluginName: "@elizaos/plugin-ollama",
    displayName: "Ollama",
    description: "Local LLM via Ollama",
    requiredTier: "free",
    category: "ai",
  },
  {
    id: "lifo-sandbox",
    pluginName: "@elizaos/plugin-form",
    displayName: "LIFO Sandbox",
    description: "Browser-based sandboxed execution",
    requiredTier: "free",
    category: "execution",
  },
  // Premium tier
  {
    id: "cua",
    pluginName: "@elizaos/plugin-cua",
    displayName: "CUA Agent",
    description: "Cloud computer-use automation",
    requiredTier: "premium",
    category: "advanced",
  },
  {
    id: "computeruse",
    pluginName: "@elizaos/plugin-computeruse",
    displayName: "Computer Use",
    description: "Local desktop control",
    requiredTier: "premium",
    category: "advanced",
  },
  {
    id: "obsidian",
    pluginName: "@elizaos/plugin-obsidian",
    displayName: "Obsidian",
    description: "Obsidian vault integration",
    requiredTier: "premium",
    category: "integration",
  },
  {
    id: "twitch-streaming",
    pluginName: "@milady/plugin-twitch-streaming",
    displayName: "Twitch Streaming",
    description: "Stream to Twitch",
    requiredTier: "premium",
    category: "media",
  },
  {
    id: "youtube-streaming",
    pluginName: "@milady/plugin-youtube-streaming",
    displayName: "YouTube Streaming",
    description: "Stream to YouTube",
    requiredTier: "premium",
    category: "media",
  },
  {
    id: "retake",
    pluginName: "@milady/plugin-retake",
    displayName: "Retake",
    description: "Retake streaming integration",
    requiredTier: "premium",
    category: "media",
  },
  {
    id: "docker-sandbox",
    pluginName: "@elizaos/plugin-form",
    displayName: "Docker Sandbox",
    description: "Isolated Docker execution",
    requiredTier: "premium",
    category: "execution",
  },
  {
    id: "tts",
    pluginName: "@elizaos/plugin-tts",
    displayName: "Text-to-Speech",
    description: "Advanced TTS with ElevenLabs/OpenAI",
    requiredTier: "premium",
    category: "media",
  },
  // Enterprise — placeholder for future entries
];

const TIER_RANK: Record<FeatureTier, number> = {
  free: 0,
  premium: 1,
  enterprise: 2,
};

/**
 * Check whether a feature is available for the given user tier and dev mode.
 *
 * - devMode "all" → everything is available
 * - devMode "paygate" → user is forced to free tier (for testing)
 * - unknown feature ids are allowed (backward compat)
 */
export function isFeatureAvailable(
  featureId: string,
  userTier: FeatureTier,
  devMode: "all" | "paygate" | false,
): { available: boolean; reason?: string; requiredTier?: FeatureTier } {
  if (devMode === "all") return { available: true };

  const entry = FEATURE_MANIFEST.find((f) => f.id === featureId);
  if (!entry) return { available: true }; // unknown = allow (backward compat)

  const effectiveTier = devMode === "paygate" ? "free" : userTier;
  if (TIER_RANK[effectiveTier] >= TIER_RANK[entry.requiredTier]) {
    return { available: true };
  }
  return {
    available: false,
    reason: `Requires ${entry.requiredTier} tier`,
    requiredTier: entry.requiredTier,
  };
}

/**
 * Resolve the effective user tier given dev mode overrides and
 * optional cloud/config tier values.
 */
export function resolveUserTier(
  devMode: "all" | "paygate" | false,
  cloudTier?: FeatureTier,
  configTier?: FeatureTier,
): FeatureTier {
  if (devMode === "all") return "enterprise";
  if (devMode === "paygate") return "free";
  return cloudTier ?? configTier ?? "free";
}
