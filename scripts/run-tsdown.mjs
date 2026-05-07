#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsdownRun = require.resolve("tsdown/run");
const args = process.argv.slice(2);
const hasConfigLoader = args.some(
  (arg) => arg === "--config-loader" || arg.startsWith("--config-loader="),
);
const tsdownArgs = hasConfigLoader
  ? args
  : ["--config-loader", "native", ...args];
const result = spawnSync(process.execPath, [tsdownRun, ...tsdownArgs], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  throw new Error(`tsdown exited due to signal ${result.signal}`);
}

process.exit(result.status ?? 1);
