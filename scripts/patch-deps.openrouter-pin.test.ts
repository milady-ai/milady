import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @elizaos/plugin-openrouter@2.0.0-alpha.12 published truncated dist files; Milady
 * pins a known-good version. See docs/plugin-resolution-and-node-path.md and
 * scripts/patch-deps.mjs (comment block).
 */
describe("OpenRouter plugin dependency pin", () => {
  it("keeps an exact package.json version (no caret) and documents WHY in patch-deps", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const v = pkg.dependencies["@elizaos/plugin-openrouter"];
    expect(v).toBe("2.0.0-alpha.10");
    expect(v).not.toMatch(/^[\^~]/);

    const patchDeps = readFileSync(
      path.join(root, "scripts/patch-deps.mjs"),
      "utf8",
    );
    expect(patchDeps).toContain("@elizaos/plugin-openrouter");
    expect(patchDeps).toContain("alpha.12");
    expect(patchDeps).toContain("truncated");
  });
});
