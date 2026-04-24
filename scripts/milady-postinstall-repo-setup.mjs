#!/usr/bin/env node
/**
 * postinstall entry point.
 *
 * Delegates to elizaOS's `run-repo-setup` (at
 * eliza/packages/app-core/scripts/run-repo-setup.mjs), which runs the
 * post-install patch/link/seed pipeline. Submodule init runs as
 * `preinstall` (see scripts/init-submodules.mjs), not here, so
 * `run-repo-setup` no longer tries to init submodules itself.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const setupPath = path.join(
  repoRoot,
  "eliza/packages/app-core/scripts/run-repo-setup.mjs",
);

const setupHref = pathToFileURL(setupPath).href;
const { runRepoSetup } = await import(setupHref);

await runRepoSetup();
