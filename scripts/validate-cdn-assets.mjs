#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  here,
  "..",
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "validate-cdn-assets.mjs",
);

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
