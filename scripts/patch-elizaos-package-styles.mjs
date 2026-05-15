#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-package-styles]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function resolvePackageDir(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

function addPackageDir(dirs, packageDir) {
  const packageJson = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJson)) return;
  dirs.set(fs.realpathSync(packageDir), packageDir);
}

function collectAppCorePackageDirs() {
  const dirs = new Map();
  const resolvedDir = resolvePackageDir("@elizaos/app-core");
  if (resolvedDir) addPackageDir(dirs, resolvedDir);
  addPackageDir(
    dirs,
    path.join(repoRoot, "node_modules", "@elizaos", "app-core"),
  );

  const bunStore = path.join(repoRoot, "node_modules", ".bun");
  if (!fs.existsSync(bunStore)) return [...dirs.values()];

  for (const entry of fs.readdirSync(bunStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@elizaos+app-core@")) {
      continue;
    }
    addPackageDir(
      dirs,
      path.join(bunStore, entry.name, "node_modules", "@elizaos", "app-core"),
    );
  }

  return [...dirs.values()];
}

function patchStylesheet(appCoreDir) {
  const stylesPath = path.join(appCoreDir, "styles/styles.css");
  if (!fs.existsSync(stylesPath)) {
    return false;
  }

  const original = fs.readFileSync(stylesPath, "utf8");
  const next = original
    .replace(
      '@import "../../../ui/src/styles/electrobun-mac-window-drag.css";',
      '@import "./electrobun-mac-window-drag.css";',
    )
    .replace('@source "../../../ui/src";', '@source "../packages/ui/src";')
    .replace('@source "../../../../apps/app-lifeops/src";\n', "");

  if (next === original) {
    return false;
  }

  fs.writeFileSync(stylesPath, next);
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), stylesPath)}`,
  );
  return true;
}

const appCoreDirs = collectAppCorePackageDirs();
if (appCoreDirs.length === 0) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

let patched = 0;
for (const appCoreDir of appCoreDirs) {
  if (patchStylesheet(appCoreDir)) {
    patched += 1;
  }
}

if (patched === 0) {
  console.log(`${LOG_PREFIX} package stylesheet already compatible.`);
}
