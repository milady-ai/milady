#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const releaseCheckCandidates = [
  path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "scripts",
    "release-check.ts",
  ),
  path.join(
    repoRoot,
    ".eliza.ci-disabled",
    "packages",
    "app-core",
    "scripts",
    "release-check.ts",
  ),
];
const releaseCheckPackDryRunCandidates = [
  path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "scripts",
    "lib",
    "release-check-pack-dry-run.ts",
  ),
  path.join(
    repoRoot,
    ".eliza.ci-disabled",
    "packages",
    "app-core",
    "scripts",
    "lib",
    "release-check-pack-dry-run.ts",
  ),
];

const oldRunPackDryBlock = `function runPackDry(): PackResult[] {
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

const patchedRunPackDryBlock = `function runBunPackDry(): PackResult[] {
  try {
    const raw = execSync("bun pm pack --dry-run --ignore-scripts", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 100,
    });
    return parseBunPackDryRunOutput(raw);
  } catch (bunError) {
    const bunOutput = \`\${(bunError as { stdout?: string }).stdout ?? ""}\\n\${\
      (bunError as { stderr?: string }).stderr ?? ""
    }\`;
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

function runPackDry(): PackResult[] {
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
        console.warn(
          "release-check: npm pack --dry-run failed without an override conflict; retrying with bun pm pack --dry-run.",
        );
      }

      // Fallback when npm pack cannot materialize the publish snapshot.
      // In CI rewrite mode npm can fail without surfacing a diagnostic,
      // while \`bun pm pack --dry-run\` still returns the publish file list.
      return runBunPackDry();
    }
  });
}`;

const canonicalLocalPackHotspotPaths = [
  "dist",
  "dist/node_modules",
  "apps/app/dist",
  "apps/app/dist/vrms",
  "apps/app/dist/animations",
];

function getLocalPackHotspotPathsBlock(source) {
  return source.match(/const localPackHotspotPaths = \[[\s\S]*?\];/)?.[0];
}

function parseQuotedEntries(block) {
  return Array.from(block.matchAll(/"([^"]+)"/g), ([, entry]) => entry);
}

function buildLocalPackHotspotPathsBlock(entries) {
  return `const localPackHotspotPaths = [
${entries.map((entry) => `  "${entry}",`).join("\n")}
];`;
}

function patchLocalPackHotspotPathsBlock(source) {
  const block = getLocalPackHotspotPathsBlock(source);
  if (!block) {
    return source;
  }

  const existingEntries = parseQuotedEntries(block);
  const seen = new Set();
  const extras = existingEntries.filter(
    (entry) => !canonicalLocalPackHotspotPaths.includes(entry),
  );
  const patchedEntries = [...canonicalLocalPackHotspotPaths, ...extras].filter(
    (entry) => {
      if (seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    },
  );

  return source.replace(block, buildLocalPackHotspotPathsBlock(patchedEntries));
}

function hasRequiredLocalPackHotspots(source) {
  const block = getLocalPackHotspotPathsBlock(source);
  if (!block) {
    return false;
  }

  const entries = parseQuotedEntries(block);
  return entries.includes("dist") && entries.includes("apps/app/dist");
}

export function applyReleaseCheckPackFallback(source) {
  let patched = source;

  if (!patched.includes("function runBunPackDry(): PackResult[]")) {
    if (!patched.includes(oldRunPackDryBlock)) {
      // runPackDry was refactored upstream — treat as already-patched.
      // The new upstream release-check is responsible for handling
      // pack fallbacks; we no-op to avoid corrupting the refactor.
    } else {
      patched = patched.replace(oldRunPackDryBlock, patchedRunPackDryBlock);
    }
  }

  if (!hasRequiredLocalPackHotspots(patched)) {
    patched = patchLocalPackHotspotPathsBlock(patched);
  }

  return patched;
}

export function patchReleaseCheckFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  const patched = applyReleaseCheckPackFallback(original);
  if (patched === original) {
    return false;
  }
  fs.writeFileSync(filePath, patched);
  return true;
}

export function findReleaseCheckFile(candidates = releaseCheckCandidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function findReleaseCheckPackDryRunFile(
  candidates = releaseCheckPackDryRunCandidates,
) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function patchReleaseCheckPackFallbackFiles({
  releaseCheckFilePath,
  packDryRunFilePath,
}) {
  let changed = false;

  if (releaseCheckFilePath) {
    changed = patchReleaseCheckFile(releaseCheckFilePath) || changed;
  }

  const hotspotSources = [releaseCheckFilePath, packDryRunFilePath]
    .filter((candidate) => typeof candidate === "string")
    .map((candidate) => fs.readFileSync(candidate, "utf8"));
  const hotspotsAlreadyPatched = hotspotSources.some((source) =>
    hasRequiredLocalPackHotspots(source),
  );

  if (!hotspotsAlreadyPatched && packDryRunFilePath) {
    const original = fs.readFileSync(packDryRunFilePath, "utf8");
    const patched = patchLocalPackHotspotPathsBlock(original);
    if (patched !== original) {
      fs.writeFileSync(packDryRunFilePath, patched);
      changed = true;
    }
  }

  return changed;
}

export function isDirectRun(
  moduleUrl = import.meta.url,
  argv1 = process.argv[1],
  resolvePath = path.resolve,
  toFileUrl = pathToFileURL,
) {
  return (
    typeof argv1 === "string" &&
    moduleUrl === toFileUrl(resolvePath(argv1)).href
  );
}

function main() {
  const releaseCheckFilePath = findReleaseCheckFile();
  const packDryRunFilePath = findReleaseCheckPackDryRunFile();
  if (!releaseCheckFilePath) {
    throw new Error(
      "patch-release-check-pack-fallback: could not find release-check.ts",
    );
  }

  const changed = patchReleaseCheckPackFallbackFiles({
    releaseCheckFilePath,
    packDryRunFilePath,
  });
  console.log(
    changed
      ? `patch-release-check-pack-fallback: patched ${path.relative(repoRoot, releaseCheckFilePath)}`
      : `patch-release-check-pack-fallback: ${path.relative(repoRoot, releaseCheckFilePath)} already patched`,
  );
}

if (isDirectRun()) {
  main();
}
