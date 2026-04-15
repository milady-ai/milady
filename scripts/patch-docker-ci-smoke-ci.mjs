#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const targetPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "docker-ci-smoke.sh",
);

if (!fs.existsSync(targetPath)) {
  throw new Error(`docker smoke helper not found: ${targetPath}`);
}

const source = fs.readFileSync(targetPath, "utf8");
const helperCommand = 'bash scripts/install-published-workspace-fallback-deps.sh';
if (source.includes(helperCommand)) {
  console.log("docker smoke helper already patched");
  process.exit(0);
}

const startMarker = 'log "Installing published-workspace fallback dependencies"';
const endMarker = 'log "Running repository postinstall"';

const startIndex = source.indexOf(startMarker);
const endIndex = source.indexOf(endMarker);
if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
  throw new Error("unable to locate fallback dependency block in docker-ci-smoke.sh");
}

const patched =
  source.slice(0, startIndex) +
  `${startMarker}\n${helperCommand}\n\n` +
  source.slice(endIndex);

fs.writeFileSync(targetPath, patched);
console.log(`patched ${path.relative(repoRoot, targetPath)}`);
