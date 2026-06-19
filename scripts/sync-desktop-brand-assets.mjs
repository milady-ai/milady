#!/usr/bin/env node
/**
 * Copy the tracked Milady desktop icon master into the Electrobun build's asset
 * dir before a desktop build.
 *
 * The Electrobun config (and build-inno.ps1) read the app icon from
 * `<eliza>/packages/app-core/platforms/electrobun/assets/appIcon.{png,ico,icns,iconset}`.
 * That dir lives in the (gitignored locally / freshly-cloned in CI) elizaOS
 * checkout and ships the upstream elizaOS icon. This copies Milady's tracked
 * master from `apps/app/public/brand/desktop/` over it so local and release
 * desktop builds wear the Milady icon. No-op when the eliza checkout is absent.
 *
 * Run before `desktop-build.mjs` (wired into build:desktop / dev:desktop and the
 * release-electrobun build jobs). Regenerate the master with
 * `apps/app/scripts/generate-brand-assets.py`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(repoRoot, "apps/app/public/brand/desktop");
const destDir = path.join(
  repoRoot,
  "eliza/packages/app-core/platforms/electrobun/assets",
);

if (!fs.existsSync(srcDir)) {
  console.error(`[sync-desktop-brand-assets] missing master: ${srcDir}`);
  process.exit(1);
}
if (!fs.existsSync(destDir)) {
  console.log(
    `[sync-desktop-brand-assets] eliza electrobun assets not present (${destDir}); skipping.`,
  );
  process.exit(0);
}

let copied = 0;
for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
  const from = path.join(srcDir, entry.name);
  const to = path.join(destDir, entry.name);
  fs.cpSync(from, to, { recursive: true });
  copied += 1;
}
console.log(
  `[sync-desktop-brand-assets] copied ${copied} icon asset(s) → ${path.relative(repoRoot, destDir)}`,
);
