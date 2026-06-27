import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");

describe("package ui source aliases", () => {
  it("does not alias @elizaos/ui to repo-local source in package mode", () => {
    const viteConfig = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );

    const toleratedMarkerBlock = "INEFFECTIVE_DYNAMIC_IMPORT_TOLERATED_MARKERS";
    const aliasConfig = viteConfig.includes(toleratedMarkerBlock)
      ? viteConfig.slice(0, viteConfig.indexOf(toleratedMarkerBlock))
      : viteConfig;
    expect(aliasConfig).not.toContain("eliza/packages/ui/src");
    expect(viteConfig).toContain("function resolveLocalUiAliases");
    expect(viteConfig).toContain("shouldUseLocalElizaSource()");
  });
});
