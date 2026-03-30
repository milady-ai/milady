import { afterEach, describe, expect, it } from "vitest";
import { getBunVersionAdvisory } from "./bun-version-guard.mjs";

describe("bun-version-guard", () => {
  const originalBun = globalThis.Bun;

  const setBunVersion = (version: string) => {
    Object.defineProperty(globalThis, "Bun", {
      value: { version },
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    if (originalBun === undefined) {
      delete (globalThis as Record<string, unknown>).Bun;
    } else {
      Object.defineProperty(globalThis, "Bun", {
        value: originalBun,
        configurable: true,
        writable: true,
      });
    }
  });

  it("returns null for Bun 1.3.x stable", () => {
    setBunVersion("1.3.11");
    expect(getBunVersionAdvisory()).toBeNull();
  });

  it("warns for canary builds", () => {
    setBunVersion("1.1.42-canary.8+1fa6d9e69");
    expect(getBunVersionAdvisory()).toContain("canary");
  });

  it("warns for non-1.3 stable versions", () => {
    setBunVersion("1.2.0");
    expect(getBunVersionAdvisory()).toContain("Recommended");
  });

  it("returns null when Bun is not available", () => {
    delete (globalThis as Record<string, unknown>).Bun;
    expect(getBunVersionAdvisory()).toBeNull();
  });
});
