import { describe, expect, it } from "vitest";
import type { ElizaConfig } from "./eliza";
import { collectPluginNames } from "./eliza";

describe("LifeOps Browser plugin integration", () => {
  it("adds @miladyai/plugin-lifeops-browser via plugins.allow short id", () => {
    const names = collectPluginNames({
      plugins: { allow: ["lifeops-browser"] },
    } as Partial<ElizaConfig> as ElizaConfig);

    expect(names.has("@miladyai/plugin-lifeops-browser")).toBe(true);
  });

  it("adds @miladyai/plugin-lifeops-browser via camelCase short id", () => {
    const names = collectPluginNames({
      plugins: { allow: ["lifeopsBrowser"] },
    } as Partial<ElizaConfig> as ElizaConfig);

    expect(names.has("@miladyai/plugin-lifeops-browser")).toBe(true);
  });

  it("adds @miladyai/plugin-lifeops-browser via explicit package name", () => {
    const names = collectPluginNames({
      plugins: { allow: ["@miladyai/plugin-lifeops-browser"] },
    } as Partial<ElizaConfig> as ElizaConfig);

    expect(names.has("@miladyai/plugin-lifeops-browser")).toBe(true);
  });
});
