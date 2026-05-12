#!/usr/bin/env node
/**
 * Bridge patch — apply Milady-local fixes to @elizaos/plugin-elizacloud
 * dist files in node_modules. These patches are also being upstreamed
 * (see https://github.com/elizaos-plugins/plugin-elizacloud/pull/15).
 * Once that PR merges and a compatible package is published, delete this script,
 * the eliza/patches/milady/elizacloud-patchset/ directory, and the postinstall hook entry.
 *
 * The static patch targets the repo-local `/responses` implementation. Package
 * artifacts can move independently across alpha/beta/main channels, so this
 * script detects the installed dist shape instead of pinning a single version.
 * If the local patch file is unavailable in package-only mode, postinstall skips
 * this optional bridge patch instead of requiring the elizaOS source checkout.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCH_REL_PATH =
  "eliza/patches/milady/elizacloud-patchset/0001-json-output-enforcement-and-fence-strip.patch";
const DIST_ENTRYPOINTS = ["dist/node/index.node.js", "dist/cjs/index.node.cjs"];
const REQUIRED_DIST_MARKER_GROUPS = [
  'format: { type: "json_object" }',
  "let jsonText = extractResponsesOutputText(data);",
  ["```(?:json)?", "`{1,}(?:json)?"],
  ['.replace(/\\n?```\\s*$/i, "")', "extractFirstBalancedJsonValue(jsonText)"],
];
const LEGACY_AI_SDK_OBJECT_MARKERS = [
  "const openai = createOpenAIClient(runtime);",
  "generateObject({",
  'output: "no-schema"',
  "experimental_repairText: getJsonRepairFunction()",
  "JSONParseError",
  'text.replace(/```json\\n|\\n```|```/g, "")',
];

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const patchPath = path.join(repoRoot, PATCH_REL_PATH);
const pluginLink = path.join(
  repoRoot,
  "node_modules",
  "@elizaos",
  "plugin-elizacloud",
);

function log(msg) {
  console.log(`[patch-elizacloud] ${msg}`);
}

function fail(msg) {
  console.error(`[patch-elizacloud] ${msg}`);
  process.exit(1);
}

function distHasMarkers(pluginRoot, markers) {
  return DIST_ENTRYPOINTS.every((relPath) => {
    const entrypointPath = path.join(pluginRoot, relPath);
    if (!fs.existsSync(entrypointPath)) {
      return false;
    }
    const source = fs.readFileSync(entrypointPath, "utf8");
    return markers.every((marker) =>
      Array.isArray(marker)
        ? marker.some((candidate) => source.includes(candidate))
        : source.includes(marker),
    );
  });
}

export function distAlreadyHasBridgeFixes(pluginRoot) {
  return distHasMarkers(pluginRoot, REQUIRED_DIST_MARKER_GROUPS);
}

export function distUsesLegacyAiSdkObjectGeneration(pluginRoot) {
  return distHasMarkers(pluginRoot, LEGACY_AI_SDK_OBJECT_MARKERS);
}

export function main() {
  if (!fs.existsSync(pluginLink)) {
    log(
      "@elizaos/plugin-elizacloud not installed — skipping (will retry on next install)",
    );
    return;
  }

  // node_modules entry is typically a symlink to the workspace package.
  // Resolve it so git apply can work against a real path.
  const pluginRoot = fs.realpathSync(pluginLink);

  const pkgJsonPath = path.join(pluginRoot, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fail(`plugin package.json missing at ${pkgJsonPath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const usesLegacyAiSdkObjectGeneration =
    distUsesLegacyAiSdkObjectGeneration(pluginRoot);

  if (distAlreadyHasBridgeFixes(pluginRoot)) {
    log(
      `installed version ${pkg.version} already contains the bridge fixes - skipping`,
    );
    return;
  }
  if (usesLegacyAiSdkObjectGeneration) {
    log(
      `installed version ${pkg.version} uses legacy AI SDK object generation - skipping direct /responses bridge patch`,
    );
    return;
  }
  if (!fs.existsSync(patchPath)) {
    log(
      `local bridge patch file missing for installed version ${pkg.version} - skipping optional patch`,
    );
    return;
  }

  // Reverse-check first: if patches are already applied, exit cleanly.
  const reverseCheck = spawnSync(
    "git",
    [
      "apply",
      "--reverse",
      "--check",
      "--unsafe-paths",
      `--directory=${pluginRoot}`,
      patchPath,
    ],
    { encoding: "utf8" },
  );

  if (reverseCheck.status === 0) {
    log("patches already applied");
    return;
  }

  // Forward-check
  const forwardCheck = spawnSync(
    "git",
    [
      "apply",
      "--check",
      "--unsafe-paths",
      `--directory=${pluginRoot}`,
      patchPath,
    ],
    { encoding: "utf8" },
  );

  if (forwardCheck.status !== 0) {
    if (distAlreadyHasBridgeFixes(pluginRoot)) {
      log("bridge fixes already present in built dist - skipping patch");
      return;
    }
    if (process.env.MILADY_REQUIRE_ELIZACLOUD_BRIDGE_PATCH === "1") {
      fail(`patch no longer applies cleanly:\n${forwardCheck.stderr.trim()}`);
    }
    log(
      `bridge patch no longer applies to installed version ${pkg.version} - skipping optional patch`,
    );
    return;
  }

  // Apply
  const apply = spawnSync(
    "git",
    ["apply", "--unsafe-paths", `--directory=${pluginRoot}`, patchPath],
    { encoding: "utf8" },
  );

  if (apply.status !== 0) {
    fail(`apply failed:\n${apply.stderr.trim()}`);
  }

  log("applied 2 patches across 2 files");
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(scriptPath) === fs.realpathSync(process.argv[1]);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
