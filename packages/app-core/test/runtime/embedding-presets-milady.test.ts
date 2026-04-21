import { describe, expect, it } from "vitest";
import {
  detectEmbeddingPreset,
  detectEmbeddingTier,
  EMBEDDING_PRESETS,
} from "../../src/runtime/embedding-presets.js";

describe("Milady embedding preset copy", () => {
  it("keeps the performance tier on the compact local embedding default", () => {
    expect(EMBEDDING_PRESETS.performance.model).toBe(
      "bge-small-en-v1.5.Q4_K_M.gguf",
    );
    expect(EMBEDDING_PRESETS.performance.label).toContain("compact");
    expect(EMBEDDING_PRESETS.performance.description.toLowerCase()).toContain(
      "memory",
    );
  });

  it("detectEmbeddingPreset returns EMBEDDING_PRESETS entry for the detected tier", () => {
    const tier = detectEmbeddingTier();
    expect(detectEmbeddingPreset()).toEqual(EMBEDDING_PRESETS[tier]);
  });
});
