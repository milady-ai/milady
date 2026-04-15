#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);

export const miladyElizaTypecheckSteps = [
  {
    // Milady's root workspace typecheck is anchored on app-core's tsconfig and
    // resolves the shipped @elizaos/ui sources through the same path aliases.
    label: "eliza app-core workspace typecheck",
    command: "bun",
    args: ["run", "verify:typecheck:workspace"],
  },
  {
    // @elizaos/ui does not currently typecheck as a leaf package in this fork
    // because optional native/app-companion imports are resolved at the app
    // layer. Keep an explicit UI gate by typechecking the shipped consumer app.
    label: "eliza ui consumer typecheck",
    command: "bun",
    args: ["run", "--cwd", "apps/app", "typecheck"],
  },
  {
    label: "eliza agent typecheck",
    command: "bun",
    args: ["run", "--cwd", "eliza/packages/agent", "typecheck"],
  },
  {
    label: "eliza cloud plugin typecheck",
    command: "bun",
    args: [
      "run",
      "--cwd",
      "eliza/plugins/plugin-elizacloud/typescript",
      "typecheck",
    ],
  },
];

// The repo-local eliza checkout includes a much larger upstream Rust/Python
// surface than Milady actually ships against. Running the root language-wide
// turbo sweeps in this repo fans out into dozens of unrelated plugin packages
// and can exhaust GitHub-hosted runners. Keep Milady CI focused on the
// TypeScript/app packages it directly validates here.
export const miladyElizaCrossLanguageChecks = [];
export const miladyCloudTypecheckSteps = [];
export const miladySidecarTypecheckSteps = [];

// Keep repo-wide checks focused on the upstream packages Milady actually ships
// against; the full eliza workspace includes unrelated plugin packages that can
// fail independently and should not block this repo's CI.
export const suites = {
  lint: [
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
    {
      label: "steward-fi lint",
      command: "bun",
      args: ["run", "--cwd", "eliza/steward-fi", "lint"],
    },
    ...miladyElizaCrossLanguageChecks,
  ],
  typecheck: [
    ...miladyElizaTypecheckSteps,
    {
      label: "apps/homepage typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "typecheck"],
    },
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
