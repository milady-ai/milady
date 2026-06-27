#!/usr/bin/env node
/**
 * Fast preflight: ensure plugin dist artifacts required at runtime exist.
 * Currently covers @elizaos/plugin-elizacloud subpaths consumed by
 * @elizaos/plugin-lifeops (lifeops-schedule-sync-contracts).
 *
 * Idempotent — skips work when artifacts are fresh (~0ms).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRequiredElizaPluginBuilds } from "./setup-upstreams.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.MILADY_SKIP_REQUIRED_ELIZA_PLUGIN_BUILDS === "1") {
  process.exit(0);
}

await ensureRequiredElizaPluginBuilds(repoRoot);
