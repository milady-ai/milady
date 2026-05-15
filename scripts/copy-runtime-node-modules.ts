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
const elizaPluginsDir = path.resolve(repoRoot, "eliza", "plugins");
const elizaCloudPackagesDir = path.resolve(
  repoRoot,
  "eliza",
  "cloud",
  "packages",
);
const elizaAgentDir = path.resolve(repoRoot, "eliza", "packages", "agent");
const elizaElectrobunDir = path.resolve(
  elizaAppCoreDir,
  "platforms",
  "electrobun",
);
const elizaAppCoreNodeModules = path.join(elizaAppCoreDir, "node_modules");
const elizaPackagesNodeModules = path.join(elizaPackagesDir, "node_modules");
const elizaElectrobunNodeModules = path.join(
  elizaElectrobunDir,
  "node_modules",
);
const elizaAgentNodeModules = path.join(elizaAgentDir, "node_modules");
const miladyRootNodeModules = path.join(repoRoot, "node_modules");
const miladyRootBunStore = path.join(miladyRootNodeModules, ".bun");
const elizaRootNodeModules = path.join(repoRoot, "eliza", "node_modules");
const elizaRootBunStore = path.join(elizaRootNodeModules, ".bun");
const bunExecutable = process.platform === "win32" ? "bun.exe" : "bun";

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

function packageExists(packageDir: string) {
  return fs.existsSync(path.join(packageDir, "package.json"));
}

function addPackageCandidate(
  candidates: Map<string, string>,
  packageDir: string,
) {
  if (!packageExists(packageDir)) {
    return;
  }
  const realPackageDir = fs.realpathSync(packageDir);
  if (!candidates.has(realPackageDir)) {
    candidates.set(realPackageDir, packageDir);
  }
}

function addBunStoreCoreCandidates(
  candidates: Map<string, string>,
  bunStore: string,
) {
  if (!fs.existsSync(bunStore)) {
    return;
  }

  for (const entry of sortedDirents(bunStore)) {
    if (!isLinkablePackageEntry(entry)) {
      continue;
    }
    addPackageCandidate(
      candidates,
      path.join(bunStore, entry.name, "node_modules", "@elizaos", "core"),
    );
  }
}

function collectCorePackageCandidates() {
  const candidates = new Map<string, string>();

  for (const nodeModules of [
    miladyRootNodeModules,
    elizaRootNodeModules,
    elizaPackagesNodeModules,
    elizaAgentNodeModules,
    elizaAppCoreNodeModules,
    elizaElectrobunNodeModules,
  ]) {
    addPackageCandidate(candidates, path.join(nodeModules, "@elizaos", "core"));
  }

  addBunStoreCoreCandidates(candidates, miladyRootBunStore);
  addBunStoreCoreCandidates(candidates, elizaRootBunStore);
  addBunStoreCoreCandidates(
    candidates,
    path.join(elizaAgentNodeModules, ".bun"),
  );

  return [...candidates.values()];
}

function findCoreRuntimeSource(packageDirs: string[]) {
  for (const packageDir of packageDirs) {
    const source = path.join(packageDir, "dist", "node", "index.node.js");
    if (fs.existsSync(source)) {
      return packageDir;
    }
  }
  return null;
}

function copyExistingFile(src: string, dest: string) {
  if (!fs.existsSync(src) || fs.existsSync(dest)) {
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function repairCoreRuntimeDist(packageDir: string, sourcePackageDir: string) {
  const copies = [
    ["dist/node/index.node.js", "dist/node/index.node.js"],
    ["dist/node/index.node.js.map", "dist/node/index.node.js.map"],
    ["dist/index.node.d.ts", "dist/node/index.node.d.ts"],
    ["dist/index.node.d.ts.map", "dist/node/index.node.d.ts.map"],
  ] as const;

  let copied = 0;
  for (const [sourceRel, destRel] of copies) {
    const source = path.join(sourcePackageDir, sourceRel);
    const dest = path.join(packageDir, destRel);
    if (copyExistingFile(source, dest)) {
      copied += 1;
    }
  }

  return copied;
}

function ensureElizaCoreRuntimeAliases() {
  const packageDirs = collectCorePackageCandidates();
  const sourcePackageDir = findCoreRuntimeSource(packageDirs);
  if (!sourcePackageDir) {
    return;
  }

  let repaired = 0;
  for (const packageDir of packageDirs) {
    repaired += repairCoreRuntimeDist(packageDir, sourcePackageDir);
  }

  if (repaired > 0) {
    console.log(
      `[copy-runtime-node-modules wrapper] repaired ${repaired} @elizaos/core runtime dist aliases from ${sourcePackageDir}`,
    );
  }
}

function ensureAgentRuntimeDistAliases() {
  const compiledDir = path.join(
    elizaAgentDir,
    "dist",
    "packages",
    "agent",
    "src",
  );
  const distDir = path.join(elizaAgentDir, "dist");
  if (!fs.existsSync(compiledDir)) {
    return;
  }

  fs.cpSync(compiledDir, distDir, { force: true, recursive: true });
  console.log(
    `[copy-runtime-node-modules wrapper] mirrored @elizaos/agent compiled dist aliases from ${compiledDir}`,
  );
}

type EnsureBuildOptions = {
  allowExistingMarkerAfterFailure?: boolean;
};

function ensureBuiltElizaPackage(
  packageDir: string,
  markerRelPath: string,
  options: EnsureBuildOptions = {},
) {
  if (!packageExists(packageDir)) {
    return false;
  }

  const marker = path.join(packageDir, markerRelPath);
  if (fs.existsSync(marker)) {
    return false;
  }

  const result = spawnSync(bunExecutable, ["run", "build"], {
    cwd: packageDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    if (options.allowExistingMarkerAfterFailure && fs.existsSync(marker)) {
      console.log(
        `[copy-runtime-node-modules wrapper] using ${markerRelPath} generated by nonzero build for ${packageDir}`,
      );
      return true;
    }
    throw new Error(
      `[copy-runtime-node-modules wrapper] failed to build ${packageDir}`,
    );
  }
  return true;
}

function ensureLocalWorkspaceDists() {
  const agentRuntimePluginBuilds = [
    [
      "eliza/plugins/plugin-agent-skills",
      "plugin-agent-skills",
      "dist/index.js",
    ],
    [
      "eliza/plugins/plugin-registry",
      "plugin-registry",
      "dist/index.js",
      { allowExistingMarkerAfterFailure: true },
    ],
    [
      "eliza/plugins/plugin-app-manager",
      "plugin-app-manager",
      "dist/index.js",
      { allowExistingMarkerAfterFailure: true },
    ],
    ["eliza/plugins/plugin-browser", "plugin-browser", "dist/index.js"],
    [
      "eliza/plugins/plugin-capacitor-bridge",
      "plugin-capacitor-bridge",
      "dist/index.js",
      { allowExistingMarkerAfterFailure: true },
    ],
    [
      "eliza/plugins/plugin-coding-tools",
      "plugin-coding-tools",
      "dist/index.js",
    ],
    ["eliza/plugins/plugin-computeruse", "plugin-computeruse", "dist/index.js"],
    ["eliza/plugins/plugin-discord", "plugin-discord", "dist/index.js"],
    ["eliza/plugins/plugin-imessage", "plugin-imessage", "dist/index.js"],
    [
      "eliza/plugins/plugin-local-inference",
      "plugin-local-inference",
      "dist/index.js",
    ],
    ["eliza/plugins/plugin-mcp", "plugin-mcp", "dist/node/index.js"],
    ["eliza/plugins/plugin-signal", "plugin-signal", "dist/index.js"],
    ["eliza/plugins/plugin-streaming", "plugin-streaming", "dist/index.js"],
    ["eliza/plugins/plugin-whatsapp", "plugin-whatsapp", "dist/index.js"],
    ["eliza/plugins/plugin-wallet", "plugin-wallet", "dist/index.mjs"],
    ["eliza/plugins/plugin-workflow", "plugin-workflow", "dist/index.js"],
    ["eliza/plugins/plugin-x402", "plugin-x402", "dist/index.js"],
  ] as const;
  const builds = [
    [
      "eliza/packages/core",
      path.join(elizaPackagesDir, "core"),
      "dist/node/index.node.js",
    ],
    [
      "eliza/packages/shared",
      path.join(elizaPackagesDir, "shared"),
      "dist/index.js",
    ],
    [
      "eliza/packages/vault",
      path.join(elizaPackagesDir, "vault"),
      "dist/index.js",
    ],
    [
      "eliza/cloud/packages/sdk",
      path.join(elizaCloudPackagesDir, "sdk"),
      "dist/index.js",
    ],
    [
      "eliza/packages/cloud-routing",
      path.join(elizaPackagesDir, "cloud-routing"),
      "dist/index.js",
    ],
    [
      "eliza/packages/agent",
      path.join(elizaPackagesDir, "agent"),
      "dist/services/app-package-modules.js",
    ],
    ["eliza/packages/app-core", elizaAppCoreDir, "dist/api/auth.js"],
    [
      "eliza/plugins/plugin-elizacloud",
      path.join(elizaPluginsDir, "plugin-elizacloud"),
      "dist/node/index.node.js",
      { allowExistingMarkerAfterFailure: true },
    ],
    ...agentRuntimePluginBuilds.map(
      ([label, packageName, markerRelPath, options]) =>
        [
          label,
          path.join(elizaPluginsDir, packageName),
          markerRelPath,
          options,
        ] as const,
    ),
  ] as const;

  for (const [label, packageDir, markerRelPath, options] of builds) {
    const built = ensureBuiltElizaPackage(packageDir, markerRelPath, options);
    if (built) {
      console.log(
        `[copy-runtime-node-modules wrapper] built ${label} dist for runtime staging`,
      );
    }
  }
}

function linkLocalScopedPackage(
  targetNodeModules: string,
  packageName: string,
  packageDir: string,
) {
  if (!packageExists(packageDir)) {
    return false;
  }

  const [scope, unscopedName] = packageName.split("/");
  if (!scope || !unscopedName) {
    return false;
  }

  const scopeDir = path.join(targetNodeModules, scope);
  const dest = path.join(scopeDir, unscopedName);
  fs.mkdirSync(scopeDir, { recursive: true });
  fs.rmSync(dest, { force: true, recursive: true });
  fs.symlinkSync(packageDir, dest, "dir");
  return true;
}

function linkLocalElizaWorkspacePackages() {
  const agentRuntimePlugins = [
    "plugin-agent-skills",
    "plugin-registry",
    "plugin-app-manager",
    "plugin-browser",
    "plugin-capacitor-bridge",
    "plugin-coding-tools",
    "plugin-computeruse",
    "plugin-discord",
    "plugin-imessage",
    "plugin-local-inference",
    "plugin-mcp",
    "plugin-signal",
    "plugin-streaming",
    "plugin-whatsapp",
    "plugin-wallet",
    "plugin-workflow",
    "plugin-x402",
  ] as const;
  const targets = [
    miladyRootNodeModules,
    elizaPackagesNodeModules,
    elizaAgentNodeModules,
    elizaAppCoreNodeModules,
    elizaElectrobunNodeModules,
    path.join(elizaPluginsDir, "plugin-elizacloud", "node_modules"),
    ...agentRuntimePlugins.map((packageName) =>
      path.join(elizaPluginsDir, packageName, "node_modules"),
    ),
  ];
  const packages = [
    ["@elizaos/core", path.join(elizaPackagesDir, "core")],
    ["@elizaos/shared", path.join(elizaPackagesDir, "shared")],
    ["@elizaos/agent", path.join(elizaPackagesDir, "agent")],
    ["@elizaos/app-core", elizaAppCoreDir],
    ["@elizaos/cloud-sdk", path.join(elizaCloudPackagesDir, "sdk")],
    ["@elizaos/cloud-routing", path.join(elizaPackagesDir, "cloud-routing")],
    ...agentRuntimePlugins.map(
      (packageName) =>
        [
          `@elizaos/${packageName}`,
          path.join(elizaPluginsDir, packageName),
        ] as const,
    ),
    [
      "@elizaos/plugin-elizacloud",
      path.join(elizaPluginsDir, "plugin-elizacloud"),
    ],
  ] as const;

  for (const targetNodeModules of targets) {
    if (!fs.existsSync(path.dirname(targetNodeModules))) continue;
    const linked = packages
      .filter(([packageName, packageDir]) =>
        linkLocalScopedPackage(targetNodeModules, packageName, packageDir),
      )
      .map(([packageName]) => packageName);
    if (linked.length > 0) {
      console.log(
        `[copy-runtime-node-modules wrapper] linked local eliza packages in ${targetNodeModules}: ${linked.join(", ")}`,
      );
    }
  }
}

function ensureMirroredNodeModules() {
  if (!fs.existsSync(miladyRootNodeModules)) {
    return;
  }

  for (const [containerDir, target] of [
    [elizaAppCoreDir, elizaAppCoreNodeModules],
    [elizaPackagesDir, elizaPackagesNodeModules],
    [elizaElectrobunDir, elizaElectrobunNodeModules],
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
linkLocalElizaWorkspacePackages();
ensureLocalWorkspaceDists();
ensureAgentRuntimeDistAliases();
linkLocalElizaWorkspacePackages();
ensureElizaCoreRuntimeAliases();

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
