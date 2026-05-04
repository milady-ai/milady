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
  workflow: ".github/workflows/ci.yml",
  action: ".github/actions/setup-bun-workspace/action.yml",
  packageJson: "package.json",
  disableScript: "scripts/disable-local-eliza-workspace.mjs",
  restoreScript: "scripts/restore-local-eliza-workspace.mjs",
  elizaCiPatchScript: "scripts/apply-eliza-ci-patches.mjs",
  elizaCiPatch:
    "eliza/patches/milady/eliza-ci-bootstrap/ci-release-contracts.patch",
  localElizaCiOverridesScript: "scripts/build-local-eliza-ci-overrides.mjs",
  publishedFallbackScript:
    "scripts/install-published-workspace-fallback-deps.sh",
  regressionMatrixScript:
    "eliza/packages/app-core/scripts/validate-regression-matrix.mjs",
};

const workflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/ci-fork.yml",
  ".github/workflows/build-docker.yml",
];

const allWorkflowPaths = fs
  .readdirSync(path.join(repoRoot, ".github", "workflows"))
  .filter((entry) => /\.ya?ml$/.test(entry))
  .sort((a, b) => a.localeCompare(b))
  .map((entry) => path.join(".github", "workflows", entry));

const requiredWorkflowSnippets = [
  "name: CI",
  "uses: ./.github/actions/setup-bun-workspace",
  "install-command: bun install --ignore-scripts --no-frozen-lockfile",
  "run: node scripts/restore-local-eliza-workspace.mjs",
  "run: node scripts/align-eliza-ci-node-modules.mjs",
  "run: bun run pre-review:local",
  "run: bun run verify:typecheck",
];

const requiredActionSnippets = [
  "disable-local-eliza-workspace:",
  "run: node scripts/disable-local-eliza-workspace.mjs",
  "name: Apply Milady eliza CI patches",
  "run: node scripts/apply-eliza-ci-patches.mjs",
  "name: Validate published-only install mode",
  "disable-local-eliza-workspace requires an install-command with --no-frozen-lockfile",
  "run: bash scripts/install-published-workspace-fallback-deps.sh",
  "name: Build local eliza CI override packages",
  "run: node scripts/build-local-eliza-ci-overrides.mjs",
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
const ciWorkflowText = readText(".github/workflows/ci.yml", failures);

assertContainsAll(
  workflowText,
  files.workflow,
  requiredWorkflowSnippets,
  failures,
);
assertCiPreReviewBootstrap(ciWorkflowText, failures);
assertContainsNone(
  ciWorkflowText,
  ".github/workflows/ci.yml",
  [
    "bun install --cwd eliza --no-frozen-lockfile --ignore-scripts",
    "bun install --cwd eliza/cloud --no-frozen-lockfile --ignore-scripts",
  ],
  failures,
);
assertContainsAll(actionText, files.action, requiredActionSnippets, failures);
assertContainsNone(actionText, files.action, forbiddenActionSnippets, failures);
assertOrdered(
  actionText,
  files.action,
  [
    "run: bash scripts/install-published-workspace-fallback-deps.sh",
    "run: node scripts/build-local-eliza-ci-overrides.mjs",
    "name: Run repository postinstall patches",
  ],
  failures,
);
assertDisabledWorkspaceInstallsUseNoFrozen(allWorkflowPaths, failures);

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

function assertOrdered(text, relativePath, snippets, targetFailures) {
  let lastIndex = -1;
  for (const snippet of snippets) {
    const index = text.indexOf(snippet);
    if (index === -1) {
      targetFailures.push(
        `${relativePath} is missing required ordered snippet: ${snippet}`,
      );
      continue;
    }
    if (index < lastIndex) {
      targetFailures.push(
        `${relativePath} has bootstrap snippets out of order: ${snippets.join(" -> ")}`,
      );
      return;
    }
    lastIndex = index;
  }
}

function assertCiPreReviewBootstrap(workflowText, targetFailures) {
  const preReviewBlockMatch = /\n {2}pre-review:\n([\s\S]*?)\n {2}lint:\n/.exec(
    workflowText,
  );

  if (!preReviewBlockMatch) {
    targetFailures.push(
      '.github/workflows/ci.yml is missing the "pre-review" job block',
    );
    return;
  }

  const preReviewBlock = preReviewBlockMatch[1];
  const requiredSnippets = [
    "- name: Align nested eliza package resolution",
    "run: node scripts/align-eliza-ci-node-modules.mjs",
    "- name: Generate protobuf types",
    "bunx @bufbuild/buf@1.67.0 generate",
    "- name: Generate i18n keyword data",
    "run: node packages/shared/scripts/generate-keywords.mjs --target ts",
    "- name: Build eliza packages required for typecheck",
    "(cd eliza/packages/core && bun run build)",
    "(cd eliza/packages/skills && bun run build)",
    "- name: Run local pre-review gate",
    "run: bun run pre-review:local",
  ];

  assertContainsAll(
    preReviewBlock,
    ".github/workflows/ci.yml pre-review job",
    requiredSnippets,
    targetFailures,
  );
}

function assertDisabledWorkspaceInstallsUseNoFrozen(
  workflowRelPaths,
  targetFailures,
) {
  for (const workflowRelPath of workflowRelPaths) {
    const text = readText(workflowRelPath, targetFailures);
    if (!text) {
      continue;
    }

    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.includes("uses: ./.github/actions/setup-bun-workspace")) {
        continue;
      }

      const setupIndent = line.match(/^\s*/)?.[0].length ?? 0;
      const blockLines = [line];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextLine = lines[cursor];
        const nextIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;
        if (nextIndent <= setupIndent && /^\s*-\s/.test(nextLine)) {
          break;
        }
        blockLines.push(nextLine);
      }

      const block = blockLines.join("\n");
      if (
        /disable-local-eliza-workspace:\s*["']?true["']?/.test(block) &&
        !block.includes("--no-frozen-lockfile")
      ) {
        targetFailures.push(
          `${workflowRelPath}:${index + 1} disables the local eliza workspace without an install-command containing --no-frozen-lockfile`,
        );
      }
    }
  }
}
