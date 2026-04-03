import { describe, expect, it } from "vitest";
import type { ElizaConfig } from "../config/types.eliza";
import { resolveAppUserName } from "./server";

function buildConfig(ui?: Record<string, unknown>): ElizaConfig {
  return { ui } as ElizaConfig;
}

describe("resolveAppUserName", () => {
  it("falls back to User when ui.ownerName is missing or blank", () => {
    expect(resolveAppUserName(buildConfig())).toBe("User");
    expect(resolveAppUserName(buildConfig({ ownerName: "   " }))).toBe("User");
  });

  it("trims persisted owner names before returning them", () => {
    expect(resolveAppUserName(buildConfig({ ownerName: "  Ada Lovelace  " }))).toBe(
      "Ada Lovelace",
    );
  });

  it("caps persisted owner names before injecting them into agent context", () => {
    expect(
      resolveAppUserName(buildConfig({ ownerName: `  ${"a".repeat(80)}  ` })),
    ).toBe("a".repeat(60));
  });
});
