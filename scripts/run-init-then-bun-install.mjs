#!/usr/bin/env node
/**
 * First-line installer: git submodules (including nested under eliza/) must
 * exist before Bun can resolve root `workspace:*` deps. Bun does not run
 * lifecycle scripts before that phase, so use this script or ./install
 * instead of a bare `bun install` on a fresh clone.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runInitSubmodules } from "./init-submodules.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

const init = runInitSubmodules({ rootDir });
if (init.failed > 0) {
  process.exit(1);
}

const bunArgs = ["install", ...process.argv.slice(2)];
const result = spawnSync("bun", bunArgs, {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

process.exit(result.status ?? 1);
