#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolveRepoRoot } from "./lib/repo-root.mjs";

const repoRoot = resolveRepoRoot(import.meta.url);

const suites = {
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
      label: "eliza TypeScript lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:check"],
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
    {
      label: "eliza TypeScript typecheck",
      command: "bun",
      args: ["x", "turbo", "run", "typecheck", "--force", "--concurrency=1"],
      cwd: `${repoRoot}/eliza`,
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

const suiteName = process.argv[2];
if (!suiteName || !(suiteName in suites)) {
  usage();
  process.exit(1);
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
    process.exit(result.status ?? 1);
  }
}
