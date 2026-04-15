import { describe, expect, it } from "vitest";

import { applyReleaseCheckPackFallback } from "./patch-release-check-pack-fallback.mjs";

const upstreamRunPackDryBlock = `function runPackDry(): PackResult[] {
  return withSanitizedNpmOverrides(() => {
    try {
      const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1024 * 1024 * 100,
      });
      return JSON.parse(raw) as PackResult[];
    } catch (error) {
      if (!isNpmOverrideConflictError(error)) {
        throw error;
      }

      // Last-resort fallback if sanitizing didn't resolve the
      // EOVERRIDE (e.g. npm found a different override conflict).
      // \`bun pm pack --dry-run\` trips over the Bun 1.3.11 lockfile
      // parser bug (Duplicate package path at bun.lock:2034:5) under
      // SKIP_LOCAL_UPSTREAMS, so we try it last and tolerate the
      // parser failure by treating it as a soft-skip — the
      // snapshot's file/dependency assertions still run against the
      // cached PackResult from a normal local/CI build.
      try {
        const raw = execSync("bun pm pack --dry-run --ignore-scripts", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          maxBuffer: 1024 * 1024 * 100,
        });
        return parseBunPackDryRunOutput(raw);
      } catch (bunError) {
        const bunOutput =
          (bunError as { stderr?: string; stdout?: string }).stderr ?? "";
        if (
          bunOutput.includes("Duplicate package path") ||
          bunOutput.includes("InvalidPackageKey")
        ) {
          console.warn(
            "release-check: bun pm pack --dry-run failed with a known Bun 1.3.11 lockfile parser error; returning empty file list (CI contract suite will still validate workflow snippets).",
          );
          return [{ files: [] }];
        }
        throw bunError;
      }
    }
  });
}`;

const upstreamLocalPackHotspotPathsBlock = `const localPackHotspotPaths = [
  "dist/node_modules",
  "apps/app/dist/vrms",
  "apps/app/dist/animations",
];`;

describe("patch-release-check-pack-fallback", () => {
  it("patches the upstream release-check pack fallback and hotspot blocks", () => {
    const source = `before\n${upstreamRunPackDryBlock}\n${upstreamLocalPackHotspotPathsBlock}\nafter\n`;

    const patched = applyReleaseCheckPackFallback(source);

    expect(patched).toContain("function runBunPackDry(): PackResult[]");
    expect(patched).toContain("retrying with bun pm pack --dry-run.");
    expect(patched).not.toContain("throw error;");
    expect(patched).toContain('  "dist",');
    expect(patched).toContain('  "apps/app/dist",');
  });

  it("patches hotspot detection even when the pack helper is already patched", () => {
    const source = `function runBunPackDry(): PackResult[] { return []; }\nfunction runPackDry(): PackResult[] { return []; }\n${upstreamLocalPackHotspotPathsBlock}\n`;

    const patched = applyReleaseCheckPackFallback(source);

    expect(patched).toContain('  "dist",');
    expect(patched).toContain('  "apps/app/dist",');
  });

  it("treats hotspot blocks with the new entries in a different order as already patched", () => {
    const reorderedHotspotBlock = `const localPackHotspotPaths = [
  "dist",
  "dist/node_modules",
  "apps/app/dist",
  "apps/app/dist/vrms",
  "apps/app/dist/animations",
];`;

    const alreadyPatchedPackHelper = `function runBunPackDry(): PackResult[] { return []; }\nfunction runPackDry(): PackResult[] { return []; }`;
    const source = `before\n${alreadyPatchedPackHelper}\n${reorderedHotspotBlock}\nafter\n`;

    expect(applyReleaseCheckPackFallback(source)).toBe(source);
  });

  it("is idempotent once both patches are present", () => {
    const alreadyPatched = applyReleaseCheckPackFallback(
      `before\n${upstreamRunPackDryBlock}\n${upstreamLocalPackHotspotPathsBlock}\nafter\n`,
    );

    expect(applyReleaseCheckPackFallback(alreadyPatched)).toBe(alreadyPatched);
  });
});
