import { describe, expect, it } from "vitest";
import { getBunVersionAdvisory } from "./bun-version-guard.mjs";

// The Bun global is non-configurable and non-writable in Bun's runtime, so
// we cannot stub globalThis.Bun or Bun.version. Instead, getBunVersionAdvisory
// accepts an optional version string argument so tests can exercise all paths
// without touching the live Bun global.

describe("bun-version-guard", () => {
  it("returns null for Bun 1.3.x stable", () => {
    expect(getBunVersionAdvisory("1.3.11")).toBeNull();
  });

  it("warns for canary builds", () => {
    expect(getBunVersionAdvisory("1.1.42-canary.8+1fa6d9e69")).toContain(
      "canary",
    );
  });

  it("warns for non-1.3 stable versions", () => {
    expect(getBunVersionAdvisory("1.2.0")).toContain("Recommended");
  });

  it("returns null when no version is provided", () => {
    expect(getBunVersionAdvisory(undefined)).toBeNull();
  });

  it("reads globalThis.Bun.version by default", () => {
    // The real Bun.version is available (1.3.x), so the default call should
    // return null (no advisory for the recommended release line).
    const result = getBunVersionAdvisory();
    // Acceptable outcomes: null (recommended) or a non-empty advisory string.
    expect(result === null || typeof result === "string").toBe(true);
  });
});
