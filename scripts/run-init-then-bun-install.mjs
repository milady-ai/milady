#!/usr/bin/env node
/**
 * First-line installer.
 *
 * Milady defaults to published elizaOS packages, so a fresh clone can install
 * without a repo-local eliza checkout. Use `bun run eliza:local` when you
 * explicitly want to clone and link local elizaOS source.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const rootDir = resolve(__dirname, "..");

const bunArgs = ["install", ...process.argv.slice(2)];
const result = spawnSync("bun", bunArgs, {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    MILADY_ELIZA_SOURCE: process.env.MILADY_ELIZA_SOURCE || "packages",
  },
  shell: false,
});

process.exit(result.status ?? 1);
