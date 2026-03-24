import { describe, expect, it } from "vitest";
import { getBunVersionAdvisory } from "./bun-version-guard.mjs";

describe("bun-version-guard", () => {
  const originalBun = globalThis.Bun;

  const setBunVersion = (version) => {
    Object.defineProperty(globalThis, "Bun", {
      value: { version },
      configurable: true,
      writable: true,
    });
  };

  const restore = () => {
    if (originalBun === undefined) {
      delete globalThis.Bun;
      return;
    }
    Object.defineProperty(globalThis, "Bun", {
      value: originalBun,
      configurable: true,
      writable: true,
    });
  };

  it("returns no advisory for Bun 1.3 stable", () => {
    setBunVersion("1.3.11");
    expect(getBunVersionAdvisory()).toBeNull();
    restore();
  });

  it("returns advisory for canary builds", () => {
    setBunVersion("1.1.42-canary.8+1fa6d9e69");
    expect(getBunVersionAdvisory()).toContain("canary");
    restore();
  });

  it("returns advisory for non-1.3 stable versions", () => {
    setBunVersion("1.2.0");
    expect(getBunVersionAdvisory()).toContain("Recommended dev toolchain");
    restore();
  });
});
