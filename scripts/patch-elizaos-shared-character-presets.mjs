#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-shared-character-presets]";
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

function collectSharedPackageDirs() {
  const dirs = new Map();
  const resolvedDir = resolvePackageDir("@elizaos/shared");
  if (resolvedDir) addPackageDir(dirs, resolvedDir);
  addPackageDir(
    dirs,
    path.join(repoRoot, "node_modules", "@elizaos", "shared"),
  );

  const bunStore = path.join(repoRoot, "node_modules", ".bun");
  if (!fs.existsSync(bunStore)) return [...dirs.values()];

  for (const entry of fs.readdirSync(bunStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@elizaos+shared@")) {
      continue;
    }
    addPackageDir(
      dirs,
      path.join(bunStore, entry.name, "node_modules", "@elizaos", "shared"),
    );
  }

  return [...dirs.values()];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function patchSharedPackage(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const characterPresetsPath = path.join(
    packageDir,
    "dist",
    "character-presets.js",
  );
  if (!fs.existsSync(characterPresetsPath)) {
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!isRecord(packageJson.exports)) {
    packageJson.exports = {};
  }
  if (packageJson.exports["./character-presets"]) {
    return false;
  }

  packageJson.exports["./character-presets"] = {
    types: "./dist/character-presets.d.ts",
    import: "./dist/character-presets.js",
    default: "./dist/character-presets.js",
  };
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), packageJsonPath)}`,
  );
  return true;
}

const sharedDirs = collectSharedPackageDirs();
if (sharedDirs.length === 0) {
  console.warn(`${LOG_PREFIX} @elizaos/shared is not installed; skipping.`);
  process.exit(0);
}

let patched = 0;
for (const sharedDir of sharedDirs) {
  if (patchSharedPackage(sharedDir)) {
    patched += 1;
  }
}

if (patched === 0) {
  console.log(`${LOG_PREFIX} package exports already compatible.`);
}
