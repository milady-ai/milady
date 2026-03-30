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
    label: "Maximum (7B text embedding)",
    description:
      "4096-dim text-embedding model (~4.2GB). Powers memory / knowledge vectors only — not chat. " +
      'The GGUF filename contains "instruct" because the upstream E5-Mistral embedding release uses that name.',
  },
} as typeof upstreamEmbeddingPresets;

export function detectEmbeddingPreset() {
  const tier = detectEmbeddingTier();
  return EMBEDDING_PRESETS[tier];
}
