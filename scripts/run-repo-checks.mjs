#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);

export const miladyElizaTypecheckSteps = [
  {
    label: "@elizaos/app-core typecheck",
    command: "bun",
    args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"],
  },
  {
    label: "@elizaos/ui typecheck",
    command: "bun",
    args: ["run", "--cwd", "eliza/packages/ui", "typecheck"],
  },
];

/** Steps that run `tsc --noEmit` for every Milady-shipped TS surface (apps + core packages + root scripts config). */
export const miladyTypecheckSteps = [
  {
    label: "Root workspace typecheck",
    command: "bun",
    args: ["run", "verify:typecheck:workspace"],
  },
  {
    label: "apps/app typecheck",
    command: "bun",
    args: ["run", "--cwd", "apps/app", "typecheck"],
  },
  {
    label: "apps/homepage typecheck",
    command: "bun",
    args: ["run", "--cwd", "apps/homepage", "typecheck"],
  },
  ...(isLocalElizaDisabled() ? [] : miladyElizaTypecheckSteps),
];

// The repo-local eliza checkout includes a much larger upstream Rust/Python
// surface than Milady actually ships against. Running the root language-wide
// turbo sweeps in this repo fans out into dozens of unrelated plugin packages
// and can exhaust GitHub-hosted runners. Keep Milady CI focused on the
// TypeScript/app packages it directly validates here.
export const miladyElizaCrossLanguageChecks = [];
export const miladyCloudTypecheckSteps = [];
export const miladySidecarTypecheckSteps = [];
const packageMode = isLocalElizaDisabled();
const i18nLintSteps = packageMode
  ? []
  : [
      {
        label: "i18n translation coverage",
        command: "bun",
        args: ["run", "verify:i18n"],
      },
    ];

// Keep repo-wide checks focused on the upstream packages Milady actually ships
// against; the full eliza workspace includes unrelated plugin packages that can
// fail independently and should not block this repo's CI.
// The app and homepage build jobs already compile their TypeScript entrypoints;
// raw tsc on those app tsconfigs follows repo-local source aliases deep into
// the vendored eliza tree and turns CI into an upstream monorepo sweep.
export const suites = {
  lint: [
    {
      label: "Submodule contract",
      command: "node",
      args: ["scripts/check-submodule-contract.mjs"],
    },
    {
      label: "Repo Biome",
      command: "bun",
      args: ["run", "verify:lint:workspace"],
    },
    {
      label: "apps/app lint",
      command: "bun",
      args: ["run", "--cwd", "apps/app", "lint"],
    },
    {
      label: "apps/homepage lint",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "lint"],
    },
    ...i18nLintSteps,
    ...miladyElizaCrossLanguageChecks,
  ],
  typecheck: [...miladyTypecheckSteps],
  "typecheck:extended": [
    ...miladyTypecheckSteps,
    ...miladyCloudTypecheckSteps,
    ...miladySidecarTypecheckSteps,
    ...miladyElizaCrossLanguageChecks,
  ],
};

function usage() {
  const suiteList = Object.keys(suites).join(", ");
  console.error(`Usage: node scripts/run-repo-checks.mjs <${suiteList}>`);
}

export function isDirectRun(
  importMetaUrl = import.meta.url,
  argv1 = process.argv[1],
  pathResolve = path.resolve,
  toFileUrl = pathToFileURL,
) {
  return (
    typeof argv1 === "string" &&
    importMetaUrl === toFileUrl(pathResolve(argv1)).href
  );
}

export function runSuite(suiteName = process.argv[2]) {
  if (!suiteName || !(suiteName in suites)) {
    usage();
    return 1;
  }

  for (const step of suites[suiteName]) {
    console.log(`\n[repo-checks] ${step.label}`);
    const result = spawnSync(step.command, step.args, {
      cwd: step.cwd ?? repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });

    if ((result.status ?? 1) !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

if (isDirectRun()) {
  process.exit(runSuite());
}
