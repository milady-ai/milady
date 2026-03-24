import { describe, expect, it } from "vitest";
import { resolveModuleDefault } from "./module-interop.mjs";

describe("module-interop", () => {
  it("returns default export when present", () => {
    const resolved = resolveModuleDefault({ default: { parse: () => "ok" } });
    expect(typeof resolved.parse).toBe("function");
  });

  it("falls back to namespace object when default is absent", () => {
    const namespace = { parse: () => "ok" };
    expect(resolveModuleDefault(namespace)).toBe(namespace);
  });
});
