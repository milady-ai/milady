import { describe, expect, it } from "vitest";
import {
  clearMiladyStartupEmbeddingProgress,
  getMiladyStartupEmbeddingAugmentation,
  parseEmbeddingProgressPercent,
  updateMiladyStartupEmbeddingProgress,
} from "../../src/runtime/milady-startup-overlay.js";

describe("milady-startup-overlay", () => {
  it("parses percent from embedding detail strings", () => {
    expect(parseEmbeddingProgressPercent(undefined)).toBeUndefined();
    expect(parseEmbeddingProgressPercent("45% of 95 MB")).toBe(45);
    expect(parseEmbeddingProgressPercent("12.5% complete")).toBe(13);
    expect(parseEmbeddingProgressPercent("no numbers")).toBeUndefined();
  });

  it("exposes augmentation while downloading and clears on ready", () => {
    clearMiladyStartupEmbeddingProgress();
    updateMiladyStartupEmbeddingProgress("downloading", "33% of 100 MB");
    const aug = getMiladyStartupEmbeddingAugmentation();
    expect(aug?.embeddingPhase).toBe("downloading");
    expect(aug?.embeddingDetail).toBe("33% of 100 MB");
    expect(aug?.embeddingProgressPct).toBe(33);

    updateMiladyStartupEmbeddingProgress("ready");
    expect(getMiladyStartupEmbeddingAugmentation()).toBeNull();
  });
});
