import { describe, expect, it } from "vitest";
import { modelLooksLikeElizaCloudHosted } from "./eliza-cloud-model-route";

describe("modelLooksLikeElizaCloudHosted", () => {
  it("detects kimi, moonshot, and eliza+cloud substrings", () => {
    expect(modelLooksLikeElizaCloudHosted("kimi-k2")).toBe(true);
    expect(modelLooksLikeElizaCloudHosted("moonshot-v1")).toBe(true);
    expect(modelLooksLikeElizaCloudHosted("foo-eliza-bar-cloud")).toBe(true);
    expect(modelLooksLikeElizaCloudHosted("gpt-4")).toBe(false);
    expect(modelLooksLikeElizaCloudHosted(undefined)).toBe(false);
  });
});
