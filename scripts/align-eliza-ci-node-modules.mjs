#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function linkRootPackage(packageName, targets) {
  const source = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (!fs.existsSync(source)) {
    throw new Error(`missing root package install: ${source}`);
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

linkRootPackage("@biomejs", ["eliza/node_modules/@biomejs"]);

linkRootPackage("drizzle-orm", [
  "eliza/node_modules/drizzle-orm",
  "eliza/packages/app-core/node_modules/drizzle-orm",
  "eliza/plugins/plugin-sql/node_modules/drizzle-orm",
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
