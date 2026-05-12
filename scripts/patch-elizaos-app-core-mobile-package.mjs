#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const LOG_PREFIX = "[patch-elizaos-app-core-mobile-package]";
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function resolveRunMobileBuildScript() {
  try {
    const appCorePackageJson = require.resolve(
      "@elizaos/app-core/package.json",
      {
        paths: [repoRoot],
      },
    );
    return path.join(
      path.dirname(appCorePackageJson),
      "scripts",
      "run-mobile-build.mjs",
    );
  } catch {
    return null;
  }
}

if (!isLocalElizaDisabled()) {
  console.log(
    `${LOG_PREFIX} local elizaOS source mode; skipping package patch.`,
  );
  process.exit(0);
}

const scriptPath = resolveRunMobileBuildScript();
if (!scriptPath || !fs.existsSync(scriptPath)) {
  console.warn(
    `${LOG_PREFIX} @elizaos/app-core run-mobile-build.mjs not found; skipping.`,
  );
  process.exit(0);
}

const current = fs.readFileSync(scriptPath, "utf8");
const patched = current
  .replaceAll(
    'await run("bun", ["run", "cap:sync:android"], { cwd: appDir });',
    'await run("bun", ["x", "capacitor", "sync", "android"], { cwd: appDir });',
  )
  .replaceAll(
    'await run("bun", ["run", "cap:sync:ios"], { cwd: appDir });',
    'await run("bun", ["x", "capacitor", "sync", "ios"], { cwd: appDir });',
  );

if (patched === current) {
  console.log(`${LOG_PREFIX} mobile script already compatible.`);
} else {
  fs.writeFileSync(scriptPath, patched, "utf8");
  console.log(`${LOG_PREFIX} patched mobile Capacitor sync commands.`);
}
