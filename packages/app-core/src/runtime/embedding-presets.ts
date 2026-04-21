import {
  detectEmbeddingTier,
  EMBEDDING_PRESETS as upstreamEmbeddingPresets,
} from "@miladyai/agent/runtime/embedding-presets";

export { detectEmbeddingTier };

/**
 * Upstream presets plus Milady copy so the large E5-Mistral **embedding** GGUF is
 * not mistaken for a chat LLM (the filename contains `instruct` from the E5 family).
 */
export const EMBEDDING_PRESETS = {
  ...upstreamEmbeddingPresets,
  performance: {
    ...upstreamEmbeddingPresets.performance,
    label: "Efficient (compact text embedding)",
    description:
      "384-dim compact text-embedding model (~133MB). Powers memory / knowledge vectors only — not chat. " +
      "Milady keeps the default SQL-safe and fast instead of auto-selecting a multi-GB embedding GGUF.",
  },
} as typeof upstreamEmbeddingPresets;

export function detectEmbeddingPreset() {
  const tier = detectEmbeddingTier();
  return EMBEDDING_PRESETS[tier];
}
