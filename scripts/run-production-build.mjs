#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function run(command, args, cwd = repoRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

if (!isLocalElizaDisabled()) {
  await run(process.execPath, [
    "scripts/run-eliza-app-core-script.mjs",
    "run-production-build.mjs",
  ]);
} else {
  const tsdownCli = require.resolve("tsdown/run");
  const vitePackageRoot = path.dirname(require.resolve("vite/package.json"));
  const viteCli = path.join(vitePackageRoot, "bin", "vite.js");

  await run(process.execPath, [
    "scripts/ensure-elizaos-optional-app-stubs.mjs",
  ]);
  await run(process.execPath, ["scripts/patch-elizaos-package-styles.mjs"]);
  await run(process.execPath, [
    "scripts/patch-elizaos-plugin-browser-bridge-package.mjs",
  ]);
  await run(process.execPath, [
    tsdownCli,
    "--config-loader",
    "native",
    "--fail-on-warn",
    "false",
  ]);
  await run(process.execPath, [
    "scripts/patch-elizaos-app-core-native-browser-package.mjs",
  ]);
  await run(
    process.execPath,
    [viteCli, "build"],
    path.join(repoRoot, "apps/app"),
  );
  await run("bun", ["scripts/write-build-info.ts"]);
}
