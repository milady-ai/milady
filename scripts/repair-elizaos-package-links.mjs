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
const rootNodeModulesDir = path.join(repoRoot, "node_modules");
const bunStoreDir = path.join(rootNodeModulesDir, ".bun");
const localElizaRoot = path.join(repoRoot, "eliza");
const scopes = ["@elizaos", "@clawville"];

function pathExists(filePath) {
  // nosemgrep: javascript_pathtraversal_rule-non-literal-fs-filename
  return fs.existsSync(filePath);
}

function createSymlink(target, linkPath, linkType) {
  // nosemgrep: javascript_pathtraversal_rule-non-literal-fs-filename
  fs.symlinkSync(target, linkPath, linkType);
}

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
  if (!pathExists(bunStoreDir)) return null;
  const prefix = bunStorePrefix(scope, packageName);
  const candidates = fs
    .readdirSync(bunStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) =>
      path.join(bunStoreDir, entry.name, "node_modules", scope, packageName),
    )
    .filter((candidate) => pathExists(path.join(candidate, "package.json")));

  return pickPreferredStorePackage(candidates);
}

function readPackageVersion(packageDir) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
    );
    return typeof manifest.version === "string" ? manifest.version : "";
  } catch {
    return "";
  }
}

function pickPreferredStorePackage(candidates) {
  if (candidates.length === 0) return null;
  const scored = candidates.map((candidate) => {
    const version = readPackageVersion(candidate);
    return {
      candidate,
      version,
      preferred: version.includes("alpha"),
    };
  });
  scored.sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return left.preferred ? -1 : 1;
    }
    return right.version.localeCompare(left.version);
  });
  return scored[0]?.candidate ?? null;
}

function repairNestedAgentDependencies() {
  if (!pathExists(bunStoreDir)) return 0;

  const nestedPackages = [
    "plugin-agent-skills",
    "core",
    "shared",
    "plugin-sql",
    "vault",
  ];
  let relinked = 0;

  for (const entry of fs.readdirSync(bunStoreDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@elizaos+agent@")) {
      continue;
    }

    const nestedScopeDir = path.join(
      bunStoreDir,
      entry.name,
      "node_modules",
      "@elizaos",
    );
    if (!pathExists(nestedScopeDir)) continue;

    for (const packageName of nestedPackages) {
      const linkPath = path.join(nestedScopeDir, packageName);
      let stat;
      try {
        stat = fs.lstatSync(linkPath);
      } catch {
        continue;
      }
      if (!stat.isSymbolicLink()) continue;

      const preferred = findBunStorePackage("@elizaos", packageName);
      if (!preferred) continue;

      let currentReal;
      try {
        currentReal = fs.realpathSync(linkPath);
      } catch {
        continue;
      }
      if (currentReal === preferred) continue;

      const currentVersion = readPackageVersion(currentReal);
      const preferredVersion = readPackageVersion(preferred);
      const shouldRelink =
        currentVersion.includes("beta") && preferredVersion.includes("alpha");
      if (!shouldRelink) continue;

      fs.unlinkSync(linkPath);
      const nextTarget = path.relative(path.dirname(linkPath), preferred);
      symlinkPackageDir(nextTarget, linkPath);
      relinked += 1;
    }
  }

  return relinked;
}

function symlinkPackageDir(target, linkPath) {
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const nextTarget =
    linkType === "junction"
      ? path.resolve(path.dirname(linkPath), target)
      : target;
  createSymlink(nextTarget, linkPath, linkType);
}

function isPathInside(parentDir, targetPath) {
  const relative = path.relative(parentDir, targetPath);
  return (
    relative === "" ||
    (relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function collectNodeModulesDirs() {
  const dirs = [rootNodeModulesDir];
  const appsDir = path.join(repoRoot, "apps");
  if (!pathExists(appsDir)) return dirs;

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appNodeModulesDir = path.join(appsDir, entry.name, "node_modules");
    if (
      isPathInside(appsDir, appNodeModulesDir) &&
      pathExists(appNodeModulesDir)
    ) {
      dirs.push(appNodeModulesDir);
    }
  }

  return dirs;
}

function repairScope(nodeModulesDir, scope) {
  const scopeDir = path.join(nodeModulesDir, scope);
  if (!pathExists(scopeDir)) return { relinked: 0, removed: 0 };

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
      symlinkPackageDir(nextTarget, linkPath);
      relinked += 1;
    } else {
      removed += 1;
    }
  }

  return { relinked, removed };
}

function readJsonIfExists(filePath) {
  if (!pathExists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function collectPackageManifestPaths() {
  const paths = [path.join(repoRoot, "package.json")];
  const appsDir = path.join(repoRoot, "apps");
  if (!pathExists(appsDir)) return paths;
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
    const scopeDir = path.join(rootNodeModulesDir, scope);
    const linkPath = path.join(scopeDir, name);
    if (pathExists(linkPath)) continue;

    const storePackage = findBunStorePackage(scope, name);
    if (!storePackage) continue;

    fs.mkdirSync(scopeDir, { recursive: true });
    const nextTarget = path.relative(path.dirname(linkPath), storePackage);
    symlinkPackageDir(nextTarget, linkPath);
    relinked += 1;
  }
  return relinked;
}

if (!pathExists(rootNodeModulesDir)) {
  console.warn(`${LOG_PREFIX} node_modules is not installed; skipping.`);
  process.exit(0);
}

if (!isLocalElizaDisabled()) {
  console.log(`${LOG_PREFIX} local elizaOS source mode; skipping repair.`);
  process.exit(0);
}

let relinked = 0;
let removed = 0;
for (const nodeModulesDir of collectNodeModulesDirs()) {
  for (const scope of scopes) {
    const result = repairScope(nodeModulesDir, scope);
    relinked += result.relinked;
    removed += result.removed;
  }
}
relinked += ensureDeclaredPackageLinks();
relinked += repairNestedAgentDependencies();

if (relinked === 0 && removed === 0) {
  console.log(`${LOG_PREFIX} no stale local package links found.`);
} else {
  console.log(
    `${LOG_PREFIX} relinked ${relinked} package(s), removed ${removed} stale local link(s).`,
  );
}
