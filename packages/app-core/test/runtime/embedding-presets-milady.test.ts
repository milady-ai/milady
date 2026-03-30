import { describe, expect, it } from "vitest";
import {
  detectEmbeddingPreset,
  detectEmbeddingTier,
  EMBEDDING_PRESETS,
} from "../../src/runtime/embedding-presets.js";

describe("Milady embedding preset copy", () => {
  it("labels performance tier as text embedding so GGUF name is not read as chat", () => {
    expect(EMBEDDING_PRESETS.performance.model).toContain("e5-mistral");
    expect(EMBEDDING_PRESETS.performance.label).toContain("text embedding");
    expect(EMBEDDING_PRESETS.performance.description.toLowerCase()).toContain(
      "memory",
    );
  });

  it("detectEmbeddingPreset returns EMBEDDING_PRESETS entry for the detected tier", () => {
    const tier = detectEmbeddingTier();
    expect(detectEmbeddingPreset()).toEqual(EMBEDDING_PRESETS[tier]);
  });
});
