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
      label: "cloud lint",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "lint"],
    },
    {
      label: "steward-fi lint",
      command: "bun",
      args: ["run", "--cwd", "eliza/steward-fi", "lint"],
    },
    {
      label: "eliza Rust lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:rust"],
    },
    {
      label: "eliza Python lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:python"],
    },
  ],
  typecheck: [
    ...miladyElizaTypecheckSteps,
    {
      label: "apps/homepage typecheck",
      command: "bun",
      args: ["run", "--cwd", "apps/homepage", "typecheck"],
    },
    {
      label: "eliza Rust typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:rust"],
    },
    {
      label: "eliza Python typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza", "typecheck:python"],
    },
    {
      label: "cloud app typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types"],
    },
    {
      label: "cloud tests typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types:tests"],
    },
    {
      label: "cloud UI typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types:ui"],
    },
    {
      label: "cloud agent-server typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types:agent-server"],
    },
    {
      label: "cloud gateway-discord typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types:gateway-discord"],
    },
    {
      label: "cloud gateway-webhook typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/cloud", "check-types:gateway-webhook"],
    },
    {
      label: "steward-fi typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/steward-fi", "typecheck"],
    },
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
