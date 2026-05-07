#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tsdownRun = require.resolve("tsdown/run");
const result = spawnSync(
  process.execPath,
  [tsdownRun, ...process.argv.slice(2)],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.signal) {
  throw new Error(`tsdown exited due to signal ${result.signal}`);
}

process.exit(result.status ?? 1);
