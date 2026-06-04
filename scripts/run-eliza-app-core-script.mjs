#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";
import { syncElizaEnvAliases } from "./lib/sync-eliza-env-aliases.mjs";

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

syncElizaEnvAliases({ defaultNamespace: "milady" });

// Desktop and iOS builds compile @elizaos/app-core source directly out of the
// repo-local eliza/ checkout, which only exists in local mode. In packages
// mode the script file is absent and the build dies with a cryptic
// missing-package error. Fail fast with an actionable message instead.
const localModeActive =
  fs.existsSync(localElizaRoot) ||
  (process.env.MILADY_ELIZA_SOURCE ?? "").trim().toLowerCase() === "local";
const isDesktopBuild =
  scriptName === "desktop-build.mjs" || scriptName === "dev-platform.mjs";
const isIosBuild =
  scriptName === "run-mobile-build.mjs" &&
  (scriptArgs[0] ?? "").startsWith("ios");
if ((isDesktopBuild || isIosBuild) && !localModeActive) {
  console.error(
    `[milady] ${scriptName} requires local mode — the desktop/iOS build compiles @elizaos/app-core source from the repo-local eliza/ checkout, which is not present in packages mode.\n` +
      "[milady] Run: bun run eliza:local",
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
    // app-core scripts that diff/validate the consuming repo (e.g.
    // validate-regression-matrix.mjs) resolve their repo root via
    // `git rev-parse --show-toplevel`, which points at the nested eliza/
    // checkout in CI rather than this milady workspace. Anchor them to the
    // milady root so the regression-matrix contract validates milady's
    // workflows and resolves the milady base SHA. Only this script reads the
    // var, so setting it for every app-core invocation has no other effect.
    env: {
      ...process.env,
      MILADY_REPO_ROOT: process.env.MILADY_REPO_ROOT?.trim() || repoRoot,
      // Milady renames the runtime entry `eliza.mjs` -> `milady.mjs`. Upstream
      // run-node.mjs (elizaOS/eliza#8126) honors ELIZA_ENTRY_FILE to spawn the
      // fork's entry instead of the hardcoded `eliza.mjs`; without this, `doctor`
      // (and any run-node.mjs-routed script) fails "Module not found eliza.mjs"
      // since this fork ships no eliza.mjs shim. No-op for app-core builds that
      // predate #8126 (they fall back to eliza.mjs); ignored by other scripts.
      ELIZA_ENTRY_FILE: process.env.ELIZA_ENTRY_FILE?.trim() || "milady.mjs",
    },
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
