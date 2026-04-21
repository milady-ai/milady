import { describe, expect, it } from "vitest";
import type { ElizaConfig } from "./eliza";
import { collectPluginNames } from "./eliza";

describe("Milady browser plugin integration", () => {
  it("adds @miladyai/plugin-milady-browser via plugins.allow short id", () => {
    const names = collectPluginNames({
      plugins: { allow: ["milady-browser"] },
    } as Partial<ElizaConfig> as ElizaConfig);

    expect(names.has("@miladyai/plugin-milady-browser")).toBe(true);
  });

  it("adds @miladyai/plugin-milady-browser via explicit package name", () => {
    const names = collectPluginNames({
      plugins: { allow: ["@miladyai/plugin-milady-browser"] },
    } as Partial<ElizaConfig> as ElizaConfig);

    expect(names.has("@miladyai/plugin-milady-browser")).toBe(true);
  });
});
