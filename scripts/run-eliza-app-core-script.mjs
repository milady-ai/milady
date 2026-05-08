#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const [scriptName, ...scriptArgs] = process.argv.slice(2);
const localElizaRoot = path.join(repoRoot, "eliza");

function resolveBunExecutable() {
  if (process.versions?.bun) {
    return process.execPath;
  }

  const bunInstall = process.env.BUN_INSTALL?.trim();
  if (bunInstall) {
    return path.join(
      bunInstall,
      "bin",
      process.platform === "win32" ? "bun.exe" : "bun",
    );
  }

  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();
  return home
    ? path.join(
        home,
        ".bun",
        "bin",
        process.platform === "win32" ? "bun.exe" : "bun",
      )
    : "bun";
}

if (!scriptName) {
  console.error(
    "usage: node scripts/run-eliza-app-core-script.mjs <script-name> [...args]",
  );
  process.exit(1);
}

const scriptPath = resolveElizaAppCoreScript(scriptName, { repoRoot });
const localScriptPath = path.join(
  localElizaRoot,
  "packages",
  "app-core",
  "scripts",
  scriptName,
);
const localRegressionMatrix = path.join(
  localElizaRoot,
  "packages",
  "app-core",
  "test",
  "regression-matrix.json",
);
// Prefer the local elizaOS app-core script when a local checkout exists.
// Makes `bun run eliza:local` use local source for every app-core script,
// so patches in the local checkout (including platforms/android/build.gradle
// templates) actually take effect.
const shouldUseLocalScript = fs.existsSync(localScriptPath);
const resolvedScriptPath = shouldUseLocalScript ? localScriptPath : scriptPath;
const useBun = path
  .resolve(resolvedScriptPath)
  .startsWith(`${path.resolve(localElizaRoot)}${path.sep}`);
const child = spawn(
  useBun ? resolveBunExecutable() : process.execPath,
  [resolvedScriptPath, ...scriptArgs],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(
    `[milady] Failed to start ${scriptName}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[milady] ${scriptName} exited due to signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
