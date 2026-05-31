#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const target = path.resolve(
  here,
  "..",
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "validate-cdn-assets.mjs",
);

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELIZA_CDN_ROOT_DIR: repoRoot,
    ELIZA_CDN_APP_ASSET_ROOT: "apps/app/public",
    ELIZA_CDN_HOMEPAGE_ASSET_ROOT: "apps/homepage/public",
  },
});
process.exit(result.status ?? 1);
