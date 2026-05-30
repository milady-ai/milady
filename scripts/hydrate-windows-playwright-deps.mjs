#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = process.cwd();
const repoRequire = createRequire(path.join(repoRoot, "package.json"));
const appRequire = createRequire(
  path.join(repoRoot, "apps", "app", "package.json"),
);

function run(args, options = {}) {
  const result = spawnSync("bun", args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeExistingLink(linkPath) {
  fs.rmSync(linkPath, { recursive: true, force: true });
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function copyPackage(sourcePath, destinationPath) {
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    filter: (candidatePath) => {
      const relative = path.relative(sourcePath, candidatePath);
      const parts = relative.split(path.sep);
      return !parts.includes("node_modules") && !parts.includes(".git");
    },
  });
}

function linkScopedPackage(
  nodeModulesRoot,
  scopedPackageName,
  sourcePath,
  options = {},
) {
  const sourceManifestPath = path.join(sourcePath, "package.json");
  if (!fs.existsSync(sourceManifestPath)) {
    throw new Error(
      `Cannot hydrate ${scopedPackageName}; package manifest is missing at ${sourceManifestPath}`,
    );
  }

  const [scopeName, packageName] = scopedPackageName.split("/");
  if (scopeName !== "@elizaos" || !packageName) {
    throw new Error(`Unsupported elizaOS package link: ${scopedPackageName}`);
  }

  const scopeDir = path.join(nodeModulesRoot, scopeName);
  const linkPath = path.join(scopeDir, packageName);
  fs.mkdirSync(scopeDir, { recursive: true });
  removeExistingLink(linkPath);
  let mode = "linked";
  if (options.copy) {
    copyPackage(sourcePath, linkPath);
    mode = "copied";
  } else {
    try {
      fs.symlinkSync(
        sourcePath,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[hydrate-windows-playwright-deps] symlink failed for ${scopedPackageName}; copying instead: ${reason}`,
      );
      copyPackage(sourcePath, linkPath);
      mode = "copied";
    }
  }
  console.log(
    `[hydrate-windows-playwright-deps] ${mode} ${scopedPackageName} at ${relativePath(
      linkPath,
    )}`,
  );
  return linkPath;
}

function linkElizaPackage(scopedPackageName, sourcePath, options = {}) {
  return linkScopedPackage(
    path.join(repoRoot, "eliza", "node_modules"),
    scopedPackageName,
    sourcePath,
    options,
  );
}

function linkRendererSourcePackage(scopedPackageName, sourcePath) {
  for (const nodeModulesRoot of [
    path.join(repoRoot, "node_modules"),
    path.join(repoRoot, "apps", "app", "node_modules"),
    path.join(repoRoot, "eliza", "node_modules"),
    path.join(repoRoot, "eliza", "packages", "app-core", "node_modules"),
  ]) {
    linkScopedPackage(nodeModulesRoot, scopedPackageName, sourcePath);
  }
}

function addEntryCandidate(candidates, value) {
  if (typeof value !== "string" || !value.trim()) return;
  candidates.push(value.replace(/^\.\//, ""));
}

function packageEntryCandidates(packageRoot, fallbackEntries) {
  const manifestPath = path.join(packageRoot, "package.json");
  const candidates = [];

  // The source-side candidate root (e.g., eliza/plugins/plugin-sql/typescript)
  // can be a directory tree without its own package.json — only dist/ +
  // node_modules/. Treat the missing manifest as "no manifest-derived
  // candidates"; the fallbackEntries below still let the caller probe
  // dist/index.node.js etc. without crashing.
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    addEntryCandidate(candidates, manifest.main);
    addEntryCandidate(candidates, manifest.module);

    const rootExport = manifest.exports?.["."] ?? manifest.exports;
    if (typeof rootExport === "string") {
      addEntryCandidate(candidates, rootExport);
    } else if (rootExport && typeof rootExport === "object") {
      addEntryCandidate(candidates, rootExport.node?.import);
      addEntryCandidate(candidates, rootExport.node?.default);
      addEntryCandidate(candidates, rootExport.bun?.import);
      addEntryCandidate(candidates, rootExport.bun?.default);
      addEntryCandidate(candidates, rootExport.import);
      addEntryCandidate(candidates, rootExport.default);
    }
  }

  for (const fallback of fallbackEntries) {
    addEntryCandidate(candidates, fallback);
  }

  return [...new Set(candidates)];
}

function findPackageRuntimeEntry(packageRoot, fallbackEntries) {
  const candidates = packageEntryCandidates(packageRoot, fallbackEntries);
  for (const candidate of candidates) {
    const filePath = path.join(packageRoot, candidate);
    if (fs.existsSync(filePath)) {
      return { candidates, filePath };
    }
  }

  return { candidates, filePath: null };
}

function assertPackageRuntimeEntry(packageRoot, label, fallbackEntries) {
  const { candidates, filePath } = findPackageRuntimeEntry(
    packageRoot,
    fallbackEntries,
  );
  if (filePath) {
    console.log(
      `[hydrate-windows-playwright-deps] verified ${label} entry at ${relativePath(
        filePath,
      )}`,
    );
    return filePath;
  }

  throw new Error(
    `Expected hydrated Windows dependency entry for ${label}; checked ${candidates
      .map((candidate) => path.join(packageRoot, candidate))
      .join(", ")}`,
  );
}

function resolvePackageRoot(requireFn, scopedPackageName) {
  try {
    return path.dirname(requireFn.resolve(`${scopedPackageName}/package.json`));
  } catch {
    return null;
  }
}

function installedPackageRoots(scopedPackageName) {
  return [
    resolvePackageRoot(repoRequire, scopedPackageName),
    resolvePackageRoot(appRequire, scopedPackageName),
  ].filter(
    (packageRoot, index, roots) =>
      packageRoot && roots.indexOf(packageRoot) === index,
  );
}

function selectRuntimePackageRoot(
  scopedPackageName,
  sourcePath,
  fallbackEntries,
) {
  const sourceEntry = findPackageRuntimeEntry(sourcePath, fallbackEntries);
  if (sourceEntry.filePath) {
    console.log(
      `[hydrate-windows-playwright-deps] using source ${scopedPackageName} at ${relativePath(
        sourcePath,
      )}`,
    );
    return sourcePath;
  }

  for (const installedRoot of installedPackageRoots(scopedPackageName)) {
    const installedEntry = findPackageRuntimeEntry(
      installedRoot,
      fallbackEntries,
    );
    if (installedEntry.filePath) {
      console.log(
        `[hydrate-windows-playwright-deps] using installed ${scopedPackageName} at ${relativePath(
          installedRoot,
        )}`,
      );
      return installedRoot;
    }
  }

  assertPackageRuntimeEntry(sourcePath, scopedPackageName, fallbackEntries);
}

function selectOptionalRuntimePackageRoot(
  scopedPackageName,
  sourcePath,
  fallbackEntries,
) {
  const sourceEntry = findPackageRuntimeEntry(sourcePath, fallbackEntries);
  if (sourceEntry.filePath) {
    console.log(
      `[hydrate-windows-playwright-deps] using source ${scopedPackageName} at ${relativePath(
        sourcePath,
      )}`,
    );
    return sourcePath;
  }

  for (const installedRoot of installedPackageRoots(scopedPackageName)) {
    const installedEntry = findPackageRuntimeEntry(
      installedRoot,
      fallbackEntries,
    );
    if (installedEntry.filePath) {
      console.log(
        `[hydrate-windows-playwright-deps] using installed ${scopedPackageName} at ${relativePath(
          installedRoot,
        )}`,
      );
      return installedRoot;
    }
  }

  console.warn(
    `[hydrate-windows-playwright-deps] optional ${scopedPackageName} runtime entry unavailable; skipping link`,
  );
  return null;
}

function assertElizaPackageEntry(scopedPackageName, fallbackEntries) {
  const [, packageName] = scopedPackageName.split("/");
  assertPackageRuntimeEntry(
    path.join(repoRoot, "eliza", "node_modules", "@elizaos", packageName),
    scopedPackageName,
    fallbackEntries,
  );
}

function assertCorePackageEntry(nodeModulesRoot) {
  assertPackageRuntimeEntry(
    path.join(nodeModulesRoot, "@elizaos", "core"),
    "@elizaos/core",
    ["dist/index.node.js", "dist/node/index.node.js"],
  );
}

function ensureElizaCoreRuntimeDeps(elizaSourceRoot) {
  // The source-link hydration above provides @elizaos/core's source but NOT its
  // dependency closure. @elizaos/core source imports runtime deps (e.g.
  // drizzle-orm in evaluators/_factCandidates.ts) that the packaged-Electrobun
  // Playwright bootstrap pulls in via startApiServer. When they cannot resolve
  // from eliza/packages/core the spec import throws "Cannot find package …" and
  // Playwright reports "No tests found" -> exit 1 (the Windows release leg).
  // Install any missing ones at the version eliza/packages/core declares so they
  // resolve from eliza/node_modules; this is a no-op when the dep is already present.
  const coreManifestPath = path.join(
    elizaSourceRoot,
    "packages",
    "core",
    "package.json",
  );
  if (!fs.existsSync(coreManifestPath)) return;
  const coreManifest = JSON.parse(fs.readFileSync(coreManifestPath, "utf8"));
  const coreRequire = createRequire(coreManifestPath);
  const requiredRuntimeDeps = ["drizzle-orm"];
  const missing = [];
  for (const dep of requiredRuntimeDeps) {
    try {
      coreRequire.resolve(dep);
    } catch {
      const version =
        coreManifest.dependencies?.[dep] ??
        coreManifest.devDependencies?.[dep] ??
        coreManifest.peerDependencies?.[dep];
      if (!version) {
        console.warn(
          `[hydrate-windows-playwright-deps] ${dep} has no version declared in @elizaos/core; installing latest`,
        );
      }
      missing.push(version ? `${dep}@${version}` : dep);
    }
  }
  if (missing.length === 0) {
    console.log(
      "[hydrate-windows-playwright-deps] @elizaos/core runtime deps already resolvable",
    );
    return;
  }
  console.log(
    `[hydrate-windows-playwright-deps] installing missing @elizaos/core runtime deps: ${missing.join(", ")}`,
  );
  run(["add", "--no-save", "--ignore-scripts", ...missing], {
    cwd: elizaSourceRoot,
  });
}

run(
  ["add", "--no-save", "--dev", "--ignore-scripts", "@playwright/test@1.59.1"],
  {
    cwd: path.join(repoRoot, "apps/app"),
  },
);

const elizaRoot = path.join(repoRoot, "eliza");
if (fs.existsSync(path.join(elizaRoot, "package.json"))) {
  const corePath = path.join(elizaRoot, "packages", "core");
  const coreRuntimePath = selectRuntimePackageRoot("@elizaos/core", corePath, [
    "dist/index.node.js",
    "dist/node/index.node.js",
  ]);
  const sharedPath = path.join(elizaRoot, "packages", "shared");
  // Upstream eliza moved @elizaos/cloud-sdk from eliza/cloud/packages/sdk
  // (inside the optional cloud submodule) to eliza/packages/cloud-sdk in
  // the main packages tree. The CI ref pinned via MILADY_ELIZA_REF only
  // carries the new location; older local checkouts may still have the
  // old one. Prefer the new path when it exists, fall back to the old
  // path otherwise, and let selectRuntimePackageRoot probe the installed
  // npm copy if neither source location is present. MILADY_SKIP_CLOUD_SUBMODULE
  // is incidental here — even with the submodule initialized, current refs
  // do not put cloud-sdk under eliza/cloud/.
  const cloudSdkNewPath = path.join(elizaRoot, "packages", "cloud-sdk");
  const cloudSdkLegacyPath = path.join(elizaRoot, "cloud", "packages", "sdk");
  const cloudSdkPath = fs.existsSync(path.join(cloudSdkNewPath, "package.json"))
    ? cloudSdkNewPath
    : cloudSdkLegacyPath;
  const cloudSdkRuntimeEntries = ["dist/index.js", "src/index.ts"];
  const sqlPluginPath = path.join(elizaRoot, "plugins", "plugin-sql");
  const sqlPluginTypescriptPath = path.join(sqlPluginPath, "typescript");
  const sqlPluginRuntimeEntries = [
    "dist/node/index.node.js",
    "index.ts",
    "drizzle/index.ts",
    "schema/index.ts",
    "types.ts",
  ];
  const elizaCloudPluginPath = path.join(
    elizaRoot,
    "plugins",
    "plugin-elizacloud",
  );
  const elizaCloudPluginRuntimeEntries = [
    "dist/node/index.node.js",
    "lib/cloud-connection.ts",
    "lib/server-cloud-tts.ts",
    "lib/cloud-secrets.ts",
  ];
  const sqlPluginRuntimePath = selectRuntimePackageRoot(
    "@elizaos/plugin-sql",
    sqlPluginTypescriptPath,
    sqlPluginRuntimeEntries,
  );
  const elizaCloudPluginRuntimePath = selectOptionalRuntimePackageRoot(
    "@elizaos/plugin-elizacloud",
    elizaCloudPluginPath,
    elizaCloudPluginRuntimeEntries,
  );
  const cloudSdkRuntimePath = selectRuntimePackageRoot(
    "@elizaos/cloud-sdk",
    cloudSdkPath,
    cloudSdkRuntimeEntries,
  );

  linkElizaPackage("@elizaos/core", coreRuntimePath);
  linkElizaPackage("@elizaos/cloud-sdk", cloudSdkRuntimePath);
  linkElizaPackage("@elizaos/shared", sharedPath);
  if (elizaCloudPluginRuntimePath) {
    linkRendererSourcePackage(
      "@elizaos/plugin-elizacloud",
      elizaCloudPluginRuntimePath,
    );
  }
  linkRendererSourcePackage("@elizaos/plugin-sql", sqlPluginRuntimePath);
  linkScopedPackage(
    path.join(sqlPluginPath, "node_modules"),
    "@elizaos/core",
    coreRuntimePath,
    { copy: true },
  );
  linkScopedPackage(
    path.join(sqlPluginTypescriptPath, "node_modules"),
    "@elizaos/core",
    coreRuntimePath,
    { copy: true },
  );
  assertElizaPackageEntry("@elizaos/core", [
    "dist/index.node.js",
    "dist/node/index.node.js",
  ]);
  assertElizaPackageEntry("@elizaos/plugin-sql", sqlPluginRuntimeEntries);
  if (elizaCloudPluginRuntimePath) {
    assertElizaPackageEntry(
      "@elizaos/plugin-elizacloud",
      elizaCloudPluginRuntimeEntries,
    );
  }
  assertCorePackageEntry(path.join(sqlPluginPath, "node_modules"));
  assertCorePackageEntry(path.join(sqlPluginTypescriptPath, "node_modules"));
  ensureElizaCoreRuntimeDeps(elizaRoot);
}
