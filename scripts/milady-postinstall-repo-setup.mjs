#!/usr/bin/env node
/**
 * postinstall entry point.
 *
 * Delegates to elizaOS's packaged `run-repo-setup`, which runs the
 * post-install patch/link/seed pipeline. Local source mode is opt-in through
 * `bun run eliza:local`; the default install path uses published packages.
 *
 * After elizaOS's pipeline runs, we apply Milady-only bridge patches
 * that target node_modules artifacts whose upstream PRs are still in
 * flight. These steps are kept in this Milady-only entry point (NOT in
 * eliza/.../run-repo-setup.mjs) so they don't affect other consumers
 * of @elizaos/app-core.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";
import { resolveElizaAppCoreScript } from "./lib/resolve-eliza-app-core-script.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// On Windows, PowerShell does not set HOME — ensure-type-package-aliases.mjs
// and similar scripts use it to locate the bun global cache. Fall back to
// USERPROFILE (the Windows equivalent) so child processes find the cache.
if (!process.env.HOME && process.env.USERPROFILE) {
  process.env.HOME = process.env.USERPROFILE;
}

const packageMode = isLocalElizaDisabled();

if (packageMode) {
  console.log(
    "[milady-postinstall] package mode: skipping elizaOS repo-local setup steps.",
  );
} else {
  const setupPath = resolveElizaAppCoreScript("run-repo-setup.mjs", {
    repoRoot,
  });

  const setupHref = pathToFileURL(setupPath).href;
  const { runRepoSetup } = await import(setupHref);

  await runRepoSetup(repoRoot);
}

// Milady-only bridge patches. Each entry runs after elizaOS's pipeline
// because that pipeline may itself rewrite node_modules (patch-deps,
// link-external-plugins, etc.) and we want our patches to win on top.
// Remove an entry once the corresponding upstream PR lands and a new
// compatible package is published.
const localSourceBridgePatchScripts = [
  // Temporary overlay for elizaOS/eliza Windows smoke startup trace drift.
  "patch-eliza-electrobun-windows-smoke-startup.mjs",
];

const packageSafeBridgePatchScripts = [
  "repair-elizaos-package-links.mjs",
  "ensure-elizaos-optional-app-stubs.mjs",
  "patch-elizaos-package-styles.mjs",
  "patch-elizaos-app-core-native-browser-package.mjs",
  "patch-noble-curves-hashes-v2.mjs",
  "patch-elizaos-app-core-windows-shell.mjs",
  "patch-elizaos-app-core-mobile-package.mjs",
  "patch-elizaos-plugin-browser-bridge-package.mjs",
  // milady-only fix for claude.ai OAuth tier — see script header.
  "patch-coding-agent-adapters-tools-flag.mjs",
];

const miladyBridgePatchScripts = packageMode
  ? packageSafeBridgePatchScripts
  : [...localSourceBridgePatchScripts, ...packageSafeBridgePatchScripts];

for (const scriptName of miladyBridgePatchScripts) {
  const scriptPath = path.join(repoRoot, "scripts", scriptName);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", (err) => {
      reject(new Error(`${scriptName} failed to spawn: ${err.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${scriptName} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${scriptName} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}
