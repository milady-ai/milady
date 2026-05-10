#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const rendererRoots = [
  "apps/app/dist",
  "eliza/packages/app/dist",
  "eliza/apps/app/dist",
]
  .map((relativePath) => path.join(repoRoot, relativePath))
  .filter((candidate) => fs.existsSync(candidate));
const sourceRoots = [
  ...rendererRoots,
  path.join(repoRoot, "eliza/plugins/app-companion/public"),
  path.join(repoRoot, "eliza/plugins/app-companion/public_src"),
  path.join(repoRoot, "apps/homepage/public"),
].filter((candidate, index, all) => {
  return fs.existsSync(candidate) && all.indexOf(candidate) === index;
});

function fail(message) {
  console.error(`[ensure-eliza-renderer-avatar-assets] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[ensure-eliza-renderer-avatar-assets] ${message}`);
}

function walkFiles(root, relativeDir) {
  const start = path.join(root, relativeDir);
  if (!fs.existsSync(start)) return [];

  const files = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  }
  return files.sort();
}

function findExisting(relativePaths) {
  for (const root of sourceRoots) {
    for (const relativePath of relativePaths) {
      const candidate = path.join(root, relativePath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

function findAnyVrm() {
  for (const root of sourceRoots) {
    const candidates = walkFiles(root, "vrms").filter((candidate) =>
      /\.vrm(\.gz)?$/i.test(candidate),
    );
    if (candidates[0]) {
      return candidates[0];
    }
  }
  return null;
}

function findAnyPng(relativeDir) {
  for (const root of sourceRoots) {
    const candidates = walkFiles(root, relativeDir).filter((candidate) =>
      /\.png$/i.test(candidate),
    );
    if (candidates[0]) {
      return candidates[0];
    }
  }
  return null;
}

function copyAsset(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (path.resolve(source) === path.resolve(destination)) {
    log(`verified ${path.relative(repoRoot, destination)}`);
    return;
  }
  fs.copyFileSync(source, destination);
  log(`copied avatar asset -> ${path.relative(repoRoot, destination)}`);
}

if (rendererRoots.length === 0) {
  fail("no renderer dist directory exists");
}

if (sourceRoots.length === 0) {
  fail("no avatar asset source directory exists");
}

for (const rendererRoot of rendererRoots) {
  const vrmSource =
    findExisting(["vrms/eliza-1.vrm.gz", "vrms/eliza-1.vrm"]) ?? findAnyVrm();
  const previewSource =
    findExisting(["vrms/previews/eliza-1.png"]) ?? findAnyPng("vrms/previews");
  const backgroundSource =
    findExisting(["vrms/backgrounds/eliza-1.png"]) ??
    findAnyPng("vrms/backgrounds");

  if (!vrmSource) fail("could not find a VRM asset to publish as eliza-1");
  if (!previewSource)
    fail("could not find a preview asset to publish as eliza-1");
  if (!backgroundSource) {
    fail("could not find a background asset to publish as eliza-1");
  }

  const vrmExtension = vrmSource.toLowerCase().endsWith(".vrm.gz")
    ? ".vrm.gz"
    : ".vrm";
  copyAsset(vrmSource, path.join(rendererRoot, `vrms/eliza-1${vrmExtension}`));
  copyAsset(
    previewSource,
    path.join(rendererRoot, "vrms/previews/eliza-1.png"),
  );
  copyAsset(
    backgroundSource,
    path.join(rendererRoot, "vrms/backgrounds/eliza-1.png"),
  );
}
