import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ELECTROBUN_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "apps",
  "app",
  "electrobun",
);

describe("build-electrobun-preload", () => {
  it("wrapper script exists", () => {
    // import.meta.dirname may point to a vitest temp dir; use repo root
    const repoRoot = path.resolve(ELECTROBUN_DIR, "..", "..", "..");
    const script = path.join(
      repoRoot,
      "scripts",
      "build-electrobun-preload.mjs",
    );
    expect(existsSync(script)).toBe(true);
  });

  it("package.json references the wrapper script", async () => {
    const pkg = await import(path.join(ELECTROBUN_DIR, "package.json"), {
      with: { type: "json" },
    });
    expect(pkg.default.scripts["build:preload"]).toContain(
      "build-electrobun-preload.mjs",
    );
  });

  it("preload entry point exists", () => {
    const entry = path.join(
      ELECTROBUN_DIR,
      "src",
      "bridge",
      "electrobun-preload.ts",
    );
    expect(existsSync(entry)).toBe(true);
  });
});
