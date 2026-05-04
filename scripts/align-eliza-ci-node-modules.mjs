#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function compareVersions(left, right) {
  const leftParts = String(left)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const rightParts = String(right)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(left).localeCompare(String(right));
}

function resolveBunStorePackage(packageName) {
  const store = path.join(repoRoot, "node_modules", ".bun");
  if (!fs.existsSync(store)) {
    return null;
  }

  let best = null;
  for (const entry of fs.readdirSync(store).sort()) {
    const packageDir = path.join(
      store,
      entry,
      "node_modules",
      ...packageName.split("/"),
    );
    const packageJsonPath = path.join(packageDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (pkg.name !== packageName) {
        continue;
      }
      const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
      if (!best || compareVersions(version, best.version) > 0) {
        best = { packageDir, version };
      }
    } catch {}
  }

  return best?.packageDir ?? null;
}

function resolveInstalledPackage(packageName) {
  const direct = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (fs.existsSync(direct)) {
    return direct;
  }

  const storePackage = resolveBunStorePackage(packageName);
  if (storePackage) {
    return storePackage;
  }

  return null;
}

function linkRootPackage(packageName, targets) {
  const source = resolveInstalledPackage(packageName);
  if (!source) {
    throw new Error(`missing root package install: ${packageName}`);
  }

  for (const targetRel of targets) {
    const target = path.join(repoRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, "dir");
    console.log(
      `[align-eliza-ci-node-modules] ${targetRel} -> ${path.relative(
        path.dirname(target),
        source,
      )}`,
    );
  }
}

function linkLocalPackage(packageName, sourceRel, targets) {
  const source = path.join(repoRoot, sourceRel);
  if (!fs.existsSync(path.join(source, "package.json"))) {
    throw new Error(
      `missing local package source for ${packageName}: ${source}`,
    );
  }

  for (const targetRel of targets) {
    const target = path.join(repoRoot, targetRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, "dir");
    console.log(
      `[align-eliza-ci-node-modules] ${targetRel} -> ${path.relative(
        path.dirname(target),
        source,
      )}`,
    );
  }
}

function linkOptionalLocalPackage(packageName, sourceRel, targets) {
  const source = path.join(repoRoot, sourceRel, "package.json");
  if (!fs.existsSync(source)) {
    console.log(
      `[align-eliza-ci-node-modules] skipping ${packageName}; missing ${sourceRel}/package.json`,
    );
    return;
  }

  linkLocalPackage(packageName, sourceRel, targets);
}

linkRootPackage("@biomejs", ["eliza/node_modules/@biomejs"]);

linkRootPackage("drizzle-orm", [
  "eliza/node_modules/drizzle-orm",
  "eliza/packages/app-core/node_modules/drizzle-orm",
  "eliza/plugins/plugin-sql/node_modules/drizzle-orm",
]);

// @types/bun is milady's canonical Bun declaration package. Some eliza
// tsconfigs still reference the older "bun-types" alias; link both names.
linkRootPackage("@types/bun", [
  "eliza/node_modules/bun-types",
  "eliza/packages/core/node_modules/bun-types",
  "eliza/packages/ui/node_modules/bun-types",
  "apps/app/node_modules/bun-types",
  "apps/homepage/node_modules/bun-types",
]);

linkRootPackage("@types/bun", [
  "eliza/node_modules/@types/bun",
  "eliza/packages/core/node_modules/@types/bun",
  "eliza/packages/ui/node_modules/@types/bun",
  "apps/app/node_modules/@types/bun",
  "apps/homepage/node_modules/@types/bun",
]);

linkRootPackage("@types/node", [
  "eliza/node_modules/@types/node",
  "eliza/packages/core/node_modules/@types/node",
  "eliza/packages/ui/node_modules/@types/node",
  "apps/app/node_modules/@types/node",
  "apps/homepage/node_modules/@types/node",
]);

linkRootPackage("@types/react", [
  "eliza/node_modules/@types/react",
  "eliza/packages/ui/node_modules/@types/react",
  "apps/app/node_modules/@types/react",
  "apps/homepage/node_modules/@types/react",
]);

linkRootPackage("@types/react-dom", [
  "eliza/node_modules/@types/react-dom",
  "eliza/packages/ui/node_modules/@types/react-dom",
  "apps/app/node_modules/@types/react-dom",
  "apps/homepage/node_modules/@types/react-dom",
]);

linkLocalPackage("@elizaos/core", "eliza/packages/core", [
  "node_modules/@elizaos/core",
  "eliza/node_modules/@elizaos/core",
  "eliza/packages/skills/node_modules/@elizaos/core",
  "apps/app/node_modules/@elizaos/core",
  "apps/homepage/node_modules/@elizaos/core",
]);

linkLocalPackage("@elizaos/skills", "eliza/packages/skills", [
  "node_modules/@elizaos/skills",
  "eliza/node_modules/@elizaos/skills",
  "eliza/packages/agent/node_modules/@elizaos/skills",
  "apps/app/node_modules/@elizaos/skills",
  "apps/homepage/node_modules/@elizaos/skills",
]);

linkOptionalLocalPackage(
  "@elizaos/plugin-agent-skills",
  "eliza/plugins/plugin-agent-skills",
  [
    "node_modules/@elizaos/plugin-agent-skills",
    "eliza/node_modules/@elizaos/plugin-agent-skills",
    "eliza/packages/agent/node_modules/@elizaos/plugin-agent-skills",
  ],
);
