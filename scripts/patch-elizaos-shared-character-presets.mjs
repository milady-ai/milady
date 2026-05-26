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
const exportCandidates = [
  {
    types: "./dist/character-presets.d.ts",
    import: "./dist/character-presets.js",
  },
  {
    types: "./character-presets.d.ts",
    import: "./character-presets.js",
  },
  {
    types: "./dist/onboarding-presets.d.ts",
    import: "./dist/onboarding-presets.js",
  },
  {
    types: "./onboarding-presets.d.ts",
    import: "./onboarding-presets.js",
  },
];

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

function relativeTargetExists(packageDir, target) {
  return fs.existsSync(path.join(packageDir, target));
}

function exportTargetExists(packageDir, value) {
  if (typeof value === "string") {
    return relativeTargetExists(packageDir, value);
  }
  if (!isRecord(value)) {
    return false;
  }
  const target = value.import ?? value.default;
  return typeof target === "string" && relativeTargetExists(packageDir, target);
}

function resolveExportTarget(packageDir) {
  return exportCandidates.find((candidate) =>
    relativeTargetExists(packageDir, candidate.import),
  );
}

function patchSharedPackage(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!isRecord(packageJson.exports)) {
    packageJson.exports = {};
  }
  if (
    exportTargetExists(packageDir, packageJson.exports["./character-presets"])
  ) {
    return false;
  }

  const exportTarget = resolveExportTarget(packageDir);
  if (!exportTarget) {
    console.warn(
      `${LOG_PREFIX} ${path.relative(process.cwd(), packageDir)} has no character/onboarding presets entry; skipping.`,
    );
    return false;
  }

  packageJson.exports["./character-presets"] = {
    types: exportTarget.types,
    import: exportTarget.import,
    default: exportTarget.import,
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
