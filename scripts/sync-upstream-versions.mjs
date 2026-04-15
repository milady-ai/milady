#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVendoredPackageMap,
  readPackageJson,
} from "./lib/read-package-json.mjs";
import {
  getElizaPackageLinks,
  getPluginPackageLinks,
  getPublishedElizaPackageSpecs,
} from "./setup-upstreams.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

/**
 * @typedef {import("./lib/package-types.d.ts").PackageJsonRecord} PackageJsonRecord
 * @typedef {import("./lib/package-types.d.ts").VendoredPackageRecord} VendoredPackageRecord
 */

if (process.argv.includes("--check")) {
  await import("./check-upstream-drift.mjs");
  process.exit(0);
}

function syncVersions() {
  const rootPkgPath = path.join(ROOT, "package.json");
  /** @type {PackageJsonRecord | null} */
  const rootPkg = readPackageJson(ROOT);
  if (!rootPkg) {
    throw new Error(
      `[sync] Unable to read ${rootPkgPath}; package.json is missing or malformed`,
    );
  }
  const pinnedDeps = getPublishedElizaPackageSpecs(ROOT);

  /** @type {Map<string, VendoredPackageRecord>} */
  const vendored = buildVendoredPackageMap([
    ...getElizaPackageLinks(ROOT),
    ...getPluginPackageLinks(ROOT),
  ]);

  let updated = 0;
  for (const [packageName, specVersion] of pinnedDeps) {
    const local = vendored.get(packageName);
    if (!local || local.version === specVersion) continue;

    for (const section of ["dependencies", "devDependencies"]) {
      if (rootPkg[section]?.[packageName] === specVersion) {
        rootPkg[section][packageName] = local.version;
        console.log(
          `[sync] ${packageName}: ${specVersion} → ${local.version} (in ${section})`,
        );
        updated++;
      }
    }
  }

  if (updated > 0) {
    writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
    console.log(
      `\n[sync] Updated ${updated} dependency spec(s) in package.json`,
    );
  } else {
    console.log("[sync] All pinned specs already match vendored versions.");
  }
}

function regenerateLockfile() {
  const lockPath = path.join(ROOT, "upstreams.lock.json");
  let elizaCommit = "unknown";
  try {
    elizaCommit = execSync("git -C eliza rev-parse HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {}

  const entries = [];

  const pkgsDir = path.join(ROOT, "eliza", "packages");
  if (existsSync(pkgsDir)) {
    for (const dir of readdirSync(pkgsDir)) {
      const pkg = readPackageJson(path.join(pkgsDir, dir));
      if (!pkg?.name || typeof pkg.version !== "string") continue;
      entries.push({
        packageName: pkg.name,
        version: pkg.version,
        sourcePath: `eliza/packages/${dir}`,
        sourceType: "core",
        repoUrl: "https://github.com/elizaos/eliza.git",
        pinnedCommit: elizaCommit.slice(0, 12),
      });
    }
  }

  const pluginsDir = path.join(ROOT, "eliza", "plugins");
  if (existsSync(pluginsDir)) {
    for (const dir of readdirSync(pluginsDir).filter((d) =>
      d.startsWith("plugin-"),
    )) {
      const tsPath = path.join(pluginsDir, dir, "typescript", "package.json");
      const plainPath = path.join(pluginsDir, dir, "package.json");
      const pkgPath = existsSync(tsPath)
        ? path.join(pluginsDir, dir, "typescript")
        : existsSync(plainPath)
          ? path.join(pluginsDir, dir)
          : null;
      if (!pkgPath) continue;
      const pkg = readPackageJson(pkgPath);
      if (!pkg?.name || typeof pkg.version !== "string") continue;
      let commit = "unknown";
      try {
        commit = execSync(
          `git -C eliza/plugins/${dir} rev-parse --short HEAD`,
          {
            cwd: ROOT,
            encoding: "utf8",
          },
        ).trim();
      } catch {}
      entries.push({
        packageName: pkg.name,
        version: pkg.version,
        sourcePath: path.relative(ROOT, pkgPath),
        sourceType: "plugin",
        repoUrl: `https://github.com/elizaos-plugins/${dir}.git`,
        pinnedCommit: commit,
      });
    }
  }

  const rootPkg = readPackageJson(ROOT);
  if (!rootPkg) {
    throw new Error(
      `[sync] Unable to read ${path.join(ROOT, "package.json")}; package.json is missing or malformed`,
    );
  }
  const bundled = new Set(
    Array.isArray(rootPkg.bundleDependencies) ? rootPkg.bundleDependencies : [],
  );
  for (const e of entries) e.bundledAtRelease = bundled.has(e.packageName);
  entries.sort((a, b) => a.packageName.localeCompare(b.packageName));

  const lockfile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    elizaCommit: elizaCommit.slice(0, 12),
    elizaBranch: "develop",
    upstreams: entries,
  };

  writeFileSync(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`);
  console.log(
    `[sync] Regenerated upstreams.lock.json (${entries.length} entries)`,
  );
}

syncVersions();
regenerateLockfile();
