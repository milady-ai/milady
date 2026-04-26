#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const target = path.resolve(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "copy-runtime-node-modules.ts",
);

const elizaAppCoreDir = path.resolve(repoRoot, "eliza", "packages", "app-core");
const elizaPackagesDir = path.resolve(repoRoot, "eliza", "packages");
const elizaAppCoreNodeModules = path.join(elizaAppCoreDir, "node_modules");
const elizaPackagesNodeModules = path.join(elizaPackagesDir, "node_modules");
const miladyRootNodeModules = path.join(repoRoot, "node_modules");
const miladyRootBunStore = path.join(miladyRootNodeModules, ".bun");

// In disable-local-eliza-workspace mode the eliza/ tree is restored *after*
// `bun install` ran against the root only, so eliza/packages/app-core/
// has no node_modules. Both the upstream copy-runtime script and Vite's
// CSS resolver expect packages to be reachable from
// eliza/packages/app-core/node_modules. Populate it with per-entry
// symlinks rather than a single bulk symlink so that:
//   - enhanced-resolve walking up from src/styles/ finds tailwindcss et al.
//   - copy-runtime-node-modules can stat .bun and per-package dirs directly.
type PopulateCounts = { directCount: number; scopedCount: number };

function sortedDirents(dir: string) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isLinkablePackageEntry(entry: Dirent) {
  return entry.isDirectory() || entry.isSymbolicLink();
}

function symlinkPackage(src: string, dest: string) {
  if (fs.existsSync(dest)) {
    return false;
  }
  try {
    fs.symlinkSync(src, dest, "dir");
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return false;
    }
    throw error;
  }
}

function linkPackagesFromNodeModules(
  sourceNodeModules: string,
  targetDir: string,
  counts: PopulateCounts,
) {
  if (!fs.existsSync(sourceNodeModules)) {
    return;
  }

  for (const entry of sortedDirents(sourceNodeModules)) {
    if (
      entry.name === ".bin" ||
      entry.name === ".bun" ||
      !isLinkablePackageEntry(entry)
    ) {
      continue;
    }

    if (entry.name.startsWith("@")) {
      const scopeSrc = path.join(sourceNodeModules, entry.name);
      const scopeDest = path.join(targetDir, entry.name);
      fs.mkdirSync(scopeDest, { recursive: true });
      for (const sub of sortedDirents(scopeSrc)) {
        if (!isLinkablePackageEntry(sub)) {
          continue;
        }
        const subDest = path.join(scopeDest, sub.name);
        if (symlinkPackage(path.join(scopeSrc, sub.name), subDest)) {
          counts.scopedCount += 1;
        }
      }
      continue;
    }

    const dest = path.join(targetDir, entry.name);
    if (symlinkPackage(path.join(sourceNodeModules, entry.name), dest)) {
      counts.directCount += 1;
    }
  }
}

function populateNodeModules(targetDir: string): PopulateCounts | null {
  const stat = fs.lstatSync(targetDir, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    fs.unlinkSync(targetDir);
  } else if (stat && !stat.isDirectory()) {
    fs.rmSync(targetDir, { force: true, recursive: true });
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const counts: PopulateCounts = { directCount: 0, scopedCount: 0 };
  linkPackagesFromNodeModules(miladyRootNodeModules, targetDir, counts);

  if (fs.existsSync(miladyRootBunStore)) {
    for (const entry of sortedDirents(miladyRootBunStore)) {
      if (!isLinkablePackageEntry(entry)) {
        continue;
      }
      linkPackagesFromNodeModules(
        path.join(miladyRootBunStore, entry.name, "node_modules"),
        targetDir,
        counts,
      );
    }
  }

  return counts;
}

function ensureMirroredNodeModules() {
  if (!fs.existsSync(miladyRootNodeModules)) {
    return;
  }

  for (const [containerDir, target] of [
    [elizaAppCoreDir, elizaAppCoreNodeModules],
    [elizaPackagesDir, elizaPackagesNodeModules],
  ] as const) {
    if (!fs.existsSync(containerDir)) continue;
    const result = populateNodeModules(target);
    if (result) {
      console.log(
        `[copy-runtime-node-modules wrapper] populated ${target} with ${result.directCount} top-level + ${result.scopedCount} scoped symlinks from ${miladyRootNodeModules}`,
      );
    }
  }
}

ensureMirroredNodeModules();

if (process.argv.includes("--link-only")) {
  process.exit(0);
}

const cwd = process.cwd();
const pathFlags = new Set(["--scan-dir", "--target-dist"]);
const args: string[] = [];
const incoming = process.argv.slice(2);
for (let i = 0; i < incoming.length; i += 1) {
  const arg = incoming[i];
  const eqIdx = arg.indexOf("=");
  if (eqIdx !== -1) {
    const flag = arg.slice(0, eqIdx);
    const value = arg.slice(eqIdx + 1);
    if (pathFlags.has(flag)) {
      args.push(`${flag}=${path.resolve(cwd, value)}`);
      continue;
    }
    args.push(arg);
    continue;
  }
  if (pathFlags.has(arg) && i + 1 < incoming.length) {
    args.push(arg);
    args.push(path.resolve(cwd, incoming[i + 1]));
    i += 1;
    continue;
  }
  args.push(arg);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", target, ...args],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
