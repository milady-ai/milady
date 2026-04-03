import { afterEach, describe, expect, it } from "vitest";
import { shouldWarmupLocalEmbeddingModel } from "../../src/runtime/embedding-warmup-policy.js";

const keys = [
  "MILADY_DISABLE_LOCAL_EMBEDDINGS",
  "ELIZA_DISABLE_LOCAL_EMBEDDINGS",
  "MILADY_CLOUD_EMBEDDINGS_DISABLED",
  "ELIZA_CLOUD_EMBEDDINGS_DISABLED",
  "ELIZAOS_CLOUD_USE_EMBEDDINGS",
] as const;

describe("shouldWarmupLocalEmbeddingModel", () => {
  afterEach(() => {
    for (const k of keys) {
      delete process.env[k];
    }
  });

  it("returns false when local embeddings are disabled", () => {
    process.env.MILADY_DISABLE_LOCAL_EMBEDDINGS = "1";
    expect(shouldWarmupLocalEmbeddingModel()).toBe(false);
  });

  it("returns true when cloud embeddings are disabled (must use local)", () => {
    process.env.MILADY_CLOUD_EMBEDDINGS_DISABLED = "1";
    process.env.ELIZAOS_CLOUD_USE_EMBEDDINGS = "true";
    expect(shouldWarmupLocalEmbeddingModel()).toBe(true);
  });

  it("returns false when Eliza Cloud is enabled and cloud embeddings stay on", () => {
    process.env.ELIZAOS_CLOUD_USE_EMBEDDINGS = "true";
    expect(shouldWarmupLocalEmbeddingModel()).toBe(false);
  });

  it("does not skip warmup just because a cloud account is linked", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    try {
      expect(shouldWarmupLocalEmbeddingModel()).toBe(true);
    } finally {
      delete process.env.ELIZAOS_CLOUD_API_KEY;
    }
  });

  it("returns true when no cloud and local embeddings allowed (BYOK / local inference)", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      expect(shouldWarmupLocalEmbeddingModel()).toBe(true);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
