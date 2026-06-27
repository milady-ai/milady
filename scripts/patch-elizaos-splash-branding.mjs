#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySplashBrandingPatches } from "./lib/patch-elizaos-splash-branding.mjs";

const LOG_PREFIX = "[patch-elizaos-splash-branding]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const patched = applySplashBrandingPatches(repoRoot, LOG_PREFIX);

if (patched === 0) {
  console.log(
    `${LOG_PREFIX} splash branding patch already applied or targets absent.`,
  );
}
