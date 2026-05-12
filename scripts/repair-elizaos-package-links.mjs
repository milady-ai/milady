#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const LOG_PREFIX = "[repair-elizaos-package-links]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nodeModulesDir = path.join(repoRoot, "node_modules");
const bunStoreDir = path.join(nodeModulesDir, ".bun");
const localElizaRoot = path.join(repoRoot, "eliza");
const scopes = ["@elizaos", "@clawville"];

function isInsideLocalEliza(linkPath, linkTarget) {
  const resolved = path.resolve(path.dirname(linkPath), linkTarget);
  if (
    resolved === localElizaRoot ||
    resolved.startsWith(`${localElizaRoot}${path.sep}`)
  ) {
    return true;
  }
  try {
    const realTarget = fs.realpathSync(resolved);
    return (
      realTarget === localElizaRoot ||
      realTarget.startsWith(`${localElizaRoot}${path.sep}`)
    );
  } catch {
    return false;
  }
}

function bunStorePrefix(scope, packageName) {
  return `${scope}+${packageName}@`;
}

function findBunStorePackage(scope, packageName) {
  if (!fs.existsSync(bunStoreDir)) return null;
  const prefix = bunStorePrefix(scope, packageName);
  const candidates = fs
    .readdirSync(bunStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) =>
      path.join(bunStoreDir, entry.name, "node_modules", scope, packageName),
    )
    .filter((candidate) => fs.existsSync(path.join(candidate, "package.json")))
    .sort((left, right) => right.localeCompare(left));

  return candidates[0] ?? null;
}

function repairScope(scope) {
  const scopeDir = path.join(nodeModulesDir, scope);
  if (!fs.existsSync(scopeDir)) return { relinked: 0, removed: 0 };

  let relinked = 0;
  let removed = 0;
  for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
    const linkPath = path.join(scopeDir, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(linkPath);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) continue;

    const linkTarget = fs.readlinkSync(linkPath);
    if (!isInsideLocalEliza(linkPath, linkTarget)) continue;

    const storePackage = findBunStorePackage(scope, entry.name);
    fs.unlinkSync(linkPath);
    if (storePackage) {
      const nextTarget = path.relative(path.dirname(linkPath), storePackage);
      fs.symlinkSync(nextTarget, linkPath);
      relinked += 1;
    } else {
      removed += 1;
    }
  }

  return { relinked, removed };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function collectPackageManifestPaths() {
  const paths = [path.join(repoRoot, "package.json")];
  const appsDir = path.join(repoRoot, "apps");
  if (!fs.existsSync(appsDir)) return paths;
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    paths.push(path.join(appsDir, entry.name, "package.json"));
  }
  return paths;
}

function collectDeclaredScopedPackages() {
  const packages = [];
  for (const manifestPath of collectPackageManifestPaths()) {
    const manifest = readJsonIfExists(manifestPath);
    if (!manifest || typeof manifest !== "object") continue;
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const dependencies = manifest[section];
      if (!dependencies || typeof dependencies !== "object") continue;
      for (const packageName of Object.keys(dependencies)) {
        const scope = scopes.find((candidate) =>
          packageName.startsWith(`${candidate}/`),
        );
        if (!scope) continue;
        packages.push({
          scope,
          name: packageName.slice(scope.length + 1),
        });
      }
    }
  }
  return packages;
}

function ensureDeclaredPackageLinks() {
  let relinked = 0;
  for (const { scope, name } of collectDeclaredScopedPackages()) {
    const scopeDir = path.join(nodeModulesDir, scope);
    const linkPath = path.join(scopeDir, name);
    if (fs.existsSync(linkPath)) continue;

    const storePackage = findBunStorePackage(scope, name);
    if (!storePackage) continue;

    fs.mkdirSync(scopeDir, { recursive: true });
    const nextTarget = path.relative(path.dirname(linkPath), storePackage);
    fs.symlinkSync(nextTarget, linkPath);
    relinked += 1;
  }
  return relinked;
}

if (!fs.existsSync(nodeModulesDir)) {
  console.warn(`${LOG_PREFIX} node_modules is not installed; skipping.`);
  process.exit(0);
}

if (!isLocalElizaDisabled()) {
  console.log(`${LOG_PREFIX} local elizaOS source mode; skipping repair.`);
  process.exit(0);
}

let relinked = 0;
let removed = 0;
for (const scope of scopes) {
  const result = repairScope(scope);
  relinked += result.relinked;
  removed += result.removed;
}
relinked += ensureDeclaredPackageLinks();

if (relinked === 0 && removed === 0) {
  console.log(`${LOG_PREFIX} no stale local package links found.`);
} else {
  console.log(
    `${LOG_PREFIX} relinked ${relinked} package(s), removed ${removed} stale local link(s).`,
  );
}
