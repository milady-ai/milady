#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);

/**
 * @typedef {import("./lib/package-types.d.ts").PackageJsonRecord & {
 *   scripts?: Record<string, string>;
 * }} BootstrapPackageJson
 */

const files = {
  workflow: ".github/workflows/test.yml",
  action: ".github/actions/setup-bun-workspace/action.yml",
  packageJson: "package.json",
  disableScript: "scripts/disable-local-eliza-workspace.mjs",
  restoreScript: "scripts/restore-local-eliza-workspace.mjs",
  regressionMatrixScript:
    "eliza/packages/app-core/scripts/validate-regression-matrix.mjs",
};

const workflows = [
  ".github/workflows/test.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/ci-fork.yml",
  ".github/workflows/docker-ci-smoke.yml",
];

const requiredWorkflowSnippets = [
  "name: Regression Matrix Contract",
  "run: node scripts/validate-ci-bootstrap-contract.mjs",
  "uses: ./.github/actions/setup-bun-workspace",
  'disable-local-eliza-workspace: "true"',
  "install-command: bun install --ignore-scripts --no-frozen-lockfile",
  "run: node scripts/restore-local-eliza-workspace.mjs",
  "run: bun run test:regression-matrix:pr",
];

const requiredActionSnippets = [
  "disable-local-eliza-workspace:",
  "run: node scripts/disable-local-eliza-workspace.mjs",
  "run: bash scripts/install-published-workspace-fallback-deps.sh",
];

const forbiddenActionSnippets = ["bun add --no-save --dev"];

const disableMarkers = [
  "scripts/disable-local-eliza-workspace.mjs",
  'disable-local-eliza-workspace: "true"',
  "disable-local-eliza-workspace: 'true'",
];

const renameMarkers = [
  "MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME=1",
  'MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME: "1"',
  "MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME: '1'",
];

const sourcePresentMarkers = [
  "bun run test:ci:real",
  "bun run test:desktop:contract",
  "bun run test:selfcontrol:unit",
  "bun run test:selfcontrol:e2e",
  "bun run test:selfcontrol:startup",
  "eliza/packages/app-core/scripts/docker-ci-smoke.sh",
  "eliza/packages/app-core/platforms/electrobun",
];

const failures = [];

for (const relativePath of Object.values(files).filter((value) =>
  value.endsWith(".mjs"),
)) {
  // Skip files inside eliza/ submodule — not present in CI when submodules: false
  if (relativePath.startsWith("eliza/")) continue;
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`Missing bootstrap dependency: ${relativePath}`);
  }
}

const workflowText = readText(files.workflow, failures);
const actionText = readText(files.action, failures);
const packageJson = readJson(files.packageJson, failures);

assertContainsAll(
  workflowText,
  files.workflow,
  requiredWorkflowSnippets,
  failures,
);
assertContainsAll(actionText, files.action, requiredActionSnippets, failures);
assertContainsNone(actionText, files.action, forbiddenActionSnippets, failures);

const regressionMatrixCommand =
  packageJson?.scripts?.["test:regression-matrix:pr"];
if (
  typeof regressionMatrixCommand !== "string" ||
  !regressionMatrixCommand.includes(files.regressionMatrixScript)
) {
  failures.push(
    `package.json script "test:regression-matrix:pr" must run ${files.regressionMatrixScript}`,
  );
}

for (const workflowRelPath of workflows) {
  const text = readText(workflowRelPath, failures);
  if (!text) {
    continue;
  }

  const hasDisableStep = disableMarkers.some((marker) => text.includes(marker));
  if (!hasDisableStep) {
    continue;
  }

  const hasRenameMode = renameMarkers.some((marker) => text.includes(marker));
  if (!hasRenameMode) {
    continue;
  }

  const conflicting = sourcePresentMarkers.filter((marker) =>
    text.includes(marker),
  );
  if (conflicting.length === 0) {
    continue;
  }

  failures.push(
    `${workflowRelPath} mixes rename-away disable mode with source-present commands: ${conflicting.join(", ")}`,
  );
}

if (failures.length > 0) {
  console.error("CI bootstrap contract validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("CI bootstrap contract validation passed.");

function readText(relativePath, targetFailures) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  } catch (error) {
    targetFailures.push(
      `Unable to read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}

/**
 * @param {string} relativePath
 * @param {string[]} targetFailures
 * @returns {BootstrapPackageJson | null}
 */
function readJson(relativePath, targetFailures) {
  const raw = readText(relativePath, targetFailures);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      targetFailures.push(
        `Unable to parse ${relativePath}: expected a package.json object`,
      );
      return null;
    }

    const scripts = parsed.scripts;
    if (
      scripts !== undefined &&
      (typeof scripts !== "object" ||
        Array.isArray(scripts) ||
        !Object.values(scripts).every((value) => typeof value === "string"))
    ) {
      targetFailures.push(
        `Unable to parse ${relativePath}: scripts must be a string map`,
      );
      return null;
    }

    return parsed;
  } catch (error) {
    targetFailures.push(
      `Unable to parse ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function assertContainsAll(text, relativePath, snippets, targetFailures) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      targetFailures.push(
        `${relativePath} is missing required bootstrap snippet: ${snippet}`,
      );
    }
  }
}

function assertContainsNone(text, relativePath, snippets, targetFailures) {
  for (const snippet of snippets) {
    if (text.includes(snippet)) {
      targetFailures.push(
        `${relativePath} still contains forbidden bootstrap snippet: ${snippet}`,
      );
    }
  }
}
