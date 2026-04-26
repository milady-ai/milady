import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyReleaseCheckPackFallback,
  isDirectRun,
  patchReleaseCheckPackFallbackFiles,
} from "./patch-release-check-pack-fallback.mjs";

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
      // \`bun pm pack --dry-run\` can trip over Bun lockfile parser drift
      // (Duplicate package path at bun.lock:2034:5) under
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
            "release-check: bun pm pack --dry-run failed with a known Bun lockfile parser error; returning empty file list (CI contract suite will still validate workflow snippets).",
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
const upstreamLifeOpsWorkflowSnippetBlock = `const requiredWorkflowSnippets = [
  "name: Build LifeOps Browser companions",
  "if bun run lifeops:browser:package:release; then",
  "LifeOps Browser packaging failed; desktop release will continue without browser companion bundles.",
  "name: Upload LifeOps Browser release artifacts",
  "name: lifeops-browser-store-bundles",
  "name: Publish LifeOps Browser companions",
  "name: Attach LifeOps Browser assets to GitHub release",
  "pattern: lifeops-browser-*",
];`;
const upstreamReleaseWorkflowDriftBlock = `const requiredWorkflowSnippets = [
  'BUN_VERSION: "1.3.11"',
  "name: Build patched Electrobun CLI for Windows",
  'node eliza/packages/app-core/scripts/build-patched-electrobun-cli.mjs "$' +
    '{{ steps.resolve-electrobun.outputs.package-dir }}"',
  "ELIZAOS_CLOUD_API_KEY: $" + "{{ secrets.ELIZAOS_CLOUD_API_KEY }}",
  "name: Run cloud live regression suite",
  "run: bun run test:live:cloud",
];
const _requiredPatchedElectrobunCliSnippets = [
  "--target=bun-windows-x64-baseline",
];
const requiredElectrobunPrWorkflowSnippets = [
  'BUN_VERSION: "1.3.11"',
];
function assertMacArtifactStagerLooksCorrect() {
  const requiredSnippets = [
    'find -L "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "*-macos-*.app.tar.zst"',
  ];
}`;
const matrixArtifactNameSnippet =
  '"$' + "{{ matrix.platform.artifact-name }}" + '"';
const buildTargetBunTargetSnippet =
  "--target=" + "$" + "{buildTarget.bunTarget}";

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

  it("rewrites stale LifeOps browser workflow snippets to the current Agent Browser Bridge naming", () => {
    const patched = applyReleaseCheckPackFallback(
      `before\n${upstreamLifeOpsWorkflowSnippetBlock}\nafter\n`,
    );

    expect(patched).toContain("name: Build Agent Browser Bridge companions");
    expect(patched).toContain(
      "if bun run browser-bridge:package:release; then",
    );
    expect(patched).toContain(
      "Agent Browser Bridge packaging failed; desktop release will continue without browser companion bundles.",
    );
    expect(patched).toContain("name: browser-bridge-store-bundles");
    expect(patched).toContain(
      "name: Attach Agent Browser Bridge assets to GitHub release",
    );
    expect(patched).toContain("pattern: browser-bridge-*");
    expect(patched).not.toContain("lifeops-browser-*");
  });

  it("rewrites stale release workflow contract snippets to current CI wiring", () => {
    const patched = applyReleaseCheckPackFallback(
      `before\n${upstreamReleaseWorkflowDriftBlock}\nafter\n`,
    );

    expect(patched).toContain('BUN_VERSION: "1.3.13"');
    expect(patched).toContain("name: Build patched Electrobun CLI");
    expect(patched).toContain(matrixArtifactNameSnippet);
    expect(patched).toContain("function resolveBuildTarget(value) {");
    expect(patched).toContain(buildTargetBunTargetSnippet);
    expect(patched).toContain(
      "secrets.ELIZAOS_CLOUD_API_KEY != '' && secrets.ELIZAOS_CLOUD_API_KEY || secrets.ELIZACLOUD_API_KEY",
    );
    expect(patched).toContain("name: Run optional cloud live regression suite");
    expect(patched).toContain(
      'if bun run test:live:cloud 2>&1 | tee \\"$log_file\\"; then',
    );
    expect(patched).toContain(
      'for tarball_pattern in "*-macos-*.app.tar.zst" "*-macos-*.app.tar.gz" "*-macos-*.tar.gz"; do',
    );
    expect(patched).toContain('tar -xzf "$TARBALL_PATH" -C "$EXTRACT_DIR"');
    expect(patched).not.toContain('BUN_VERSION: "1.3.11"');
    expect(patched).not.toContain(
      "name: Build patched Electrobun CLI for Windows",
    );
    expect(patched).not.toContain("name: Run cloud live regression suite");
    expect(patched).not.toContain("run: bun run test:live:cloud");
    expect(patched).not.toContain("--target=bun-windows-x64-baseline");
  });

  it("patches hotspot blocks that drifted from the original upstream shape", () => {
    const driftedHotspotBlock = `const localPackHotspotPaths = [
  "apps/app/dist/animations",
  "dist/node_modules",
  "custom/local/hotspot",
];`;
    const source = `function runBunPackDry(): PackResult[] { return []; }\nfunction runPackDry(): PackResult[] { return []; }\n${driftedHotspotBlock}\n`;

    const patched = applyReleaseCheckPackFallback(source);

    expect(patched).toContain('  "dist",');
    expect(patched).toContain('  "dist/node_modules",');
    expect(patched).toContain('  "apps/app/dist",');
    expect(patched).toContain('  "apps/app/dist/vrms",');
    expect(patched).toContain('  "apps/app/dist/animations",');
    expect(patched).toContain('  "custom/local/hotspot",');
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

  it("does not throw when the hotspot block moved to the pack-dry-run helper", () => {
    const source = `before\n${upstreamRunPackDryBlock}\nafter\n`;

    expect(() => applyReleaseCheckPackFallback(source)).not.toThrow();
    expect(applyReleaseCheckPackFallback(source)).toContain(
      "function runBunPackDry(): PackResult[]",
    );
  });

  it("patches hotspot paths in the pack-dry-run helper when release-check no longer defines them inline", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "patch-release-check-pack-fallback-"),
    );
    const releaseCheckPath = path.join(tempDir, "release-check.ts");
    const packDryRunPath = path.join(tempDir, "release-check-pack-dry-run.ts");

    try {
      fs.writeFileSync(
        releaseCheckPath,
        `before\n${upstreamRunPackDryBlock}\nafter\n`,
      );
      fs.writeFileSync(
        packDryRunPath,
        `${upstreamLocalPackHotspotPathsBlock}\n`,
      );

      const changed = patchReleaseCheckPackFallbackFiles({
        releaseCheckFilePath: releaseCheckPath,
        packDryRunFilePath: packDryRunPath,
      });

      expect(changed).toBe(true);
      expect(fs.readFileSync(releaseCheckPath, "utf8")).toContain(
        "function runBunPackDry(): PackResult[]",
      );
      const patchedPackDryRun = fs.readFileSync(packDryRunPath, "utf8");
      expect(patchedPackDryRun).toContain('  "dist",');
      expect(patchedPackDryRun).toContain('  "apps/app/dist",');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("matches direct-run detection with injected path/url helpers", () => {
    const windowsScriptPath =
      "C:\\repo\\scripts\\patch-release-check-pack-fallback.mjs";
    const toWindowsFileUrl = (value) =>
      new URL(`file:///${value.replace(/\\\\/g, "/")}`);

    expect(
      isDirectRun(
        "file:///C:/repo/scripts/patch-release-check-pack-fallback.mjs",
        windowsScriptPath,
        () => windowsScriptPath,
        toWindowsFileUrl,
      ),
    ).toBe(true);
    expect(
      isDirectRun(
        "file:///C:/repo/scripts/other-script.mjs",
        windowsScriptPath,
        () => windowsScriptPath,
        toWindowsFileUrl,
      ),
    ).toBe(false);
  });
});
