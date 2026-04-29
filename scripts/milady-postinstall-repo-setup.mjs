#!/usr/bin/env node
/**
 * postinstall entry point.
 *
 * Delegates to elizaOS's `run-repo-setup` (at
 * eliza/packages/app-core/scripts/run-repo-setup.mjs), which runs the
 * post-install patch/link/seed pipeline. Submodule init runs as
 * `preinstall` (see scripts/init-submodules.mjs), not here, so
 * `run-repo-setup` no longer tries to init submodules itself.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// On Windows, PowerShell does not set HOME — ensure-type-package-aliases.mjs
// and similar scripts use it to locate the bun global cache. Fall back to
// USERPROFILE (the Windows equivalent) so child processes find the cache.
if (!process.env.HOME && process.env.USERPROFILE) {
  process.env.HOME = process.env.USERPROFILE;
}

const setupPath = path.join(
  repoRoot,
  "eliza/packages/app-core/scripts/run-repo-setup.mjs",
);

const setupHref = pathToFileURL(setupPath).href;
const { runRepoSetup } = await import(setupHref);

await runRepoSetup(repoRoot);

// Milady-only bridge patches. Each entry runs after elizaOS's pipeline
// because that pipeline may itself rewrite node_modules (patch-deps,
// link-external-plugins, etc.) and we want our patches to win on top.
// Remove an entry once the corresponding upstream PR lands and a new
// alpha is published.
const miladyBridgePatchScripts = [
  // https://github.com/elizaos-plugins/plugin-elizacloud/pull/15
  "patch-elizacloud.mjs",
];

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
