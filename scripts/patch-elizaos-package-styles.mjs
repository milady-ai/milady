#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-package-styles]";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function resolvePackageDir(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

function addPackageDir(dirs, packageDir) {
  const packageJson = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJson)) return;
  dirs.set(fs.realpathSync(packageDir), packageDir);
}

function collectAppCorePackageDirs() {
  const dirs = new Map();
  const resolvedDir = resolvePackageDir("@elizaos/app-core");
  if (resolvedDir) addPackageDir(dirs, resolvedDir);
  addPackageDir(
    dirs,
    path.join(repoRoot, "node_modules", "@elizaos", "app-core"),
  );

  const bunStore = path.join(repoRoot, "node_modules", ".bun");
  if (!fs.existsSync(bunStore)) return [...dirs.values()];

  for (const entry of fs.readdirSync(bunStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("@elizaos+app-core@")) {
      continue;
    }
    addPackageDir(
      dirs,
      path.join(bunStore, entry.name, "node_modules", "@elizaos", "app-core"),
    );
  }

  return [...dirs.values()];
}

function patchStylesheet(appCoreDir) {
  const stylesPath = path.join(appCoreDir, "styles/styles.css");
  if (!fs.existsSync(stylesPath)) {
    return false;
  }

  const original = fs.readFileSync(stylesPath, "utf8");
  const next = original
    .replace(
      '@import "../../../ui/src/styles/electrobun-mac-window-drag.css";',
      '@import "./electrobun-mac-window-drag.css";',
    )
    .replace('@source "../../../ui/src";', '@source "../packages/ui/src";')
    .replace('@source "../../../../apps/app-lifeops/src";\n', "");

  if (next === original) {
    return false;
  }

  fs.writeFileSync(stylesPath, next);
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), stylesPath)}`,
  );
  return true;
}

function patchNativePluginsRootResolution(appCoreDir) {
  const scriptPath = path.join(
    appCoreDir,
    "scripts/lib/capacitor-plugin-names.mjs",
  );
  if (!fs.existsSync(scriptPath)) {
    return false;
  }

  const original = fs.readFileSync(scriptPath, "utf8");
  // Upstream resolves NATIVE_PLUGINS_ROOT with `__dirname/../../../native-plugins`,
  // calibrated for the monorepo source tree (eliza/packages/native-plugins). The
  // published tarball ships those packages at <app-core>/packages/native-plugins
  // instead, and never at the sibling the walk-up points to — so in packages mode
  // the eager top-level readdirSync throws `ENOENT scandir …/@elizaos/native-plugins`
  // at import time, which crashes build-native-plugins.mjs before its CI skip can
  // run and fails `bun run build`. Anchor the root to the published layout when it
  // exists, and make the directory scan tolerate absence (empty list) so the module
  // imports cleanly; the published plugins ship no `src/index.ts`, so the list is
  // empty regardless and the CI native-plugin skip is preserved.
  const currentImplementation = `export const NATIVE_PLUGINS_ROOT = path.resolve(
  __dirname,
  "../../../native-plugins",
);

/** Short names of each real workspace package under {@link NATIVE_PLUGINS_ROOT}. */
export const CAPACITOR_PLUGIN_NAMES = fs
  .readdirSync(NATIVE_PLUGINS_ROOT, { withFileTypes: true })`;
  const patchedImplementation = `const __nativePluginsRootCandidates = [
  path.resolve(__dirname, "../../packages/native-plugins"),
  path.resolve(__dirname, "../../../native-plugins"),
];
export const NATIVE_PLUGINS_ROOT =
  __nativePluginsRootCandidates.find((candidate) => fs.existsSync(candidate)) ??
  __nativePluginsRootCandidates[__nativePluginsRootCandidates.length - 1];

/** Short names of each real workspace package under {@link NATIVE_PLUGINS_ROOT}. */
export const CAPACITOR_PLUGIN_NAMES = (
  fs.existsSync(NATIVE_PLUGINS_ROOT)
    ? fs.readdirSync(NATIVE_PLUGINS_ROOT, { withFileTypes: true })
    : []
)`;

  if (original.includes(patchedImplementation)) {
    return false;
  }

  if (!original.includes(currentImplementation)) {
    return false;
  }

  fs.writeFileSync(
    scriptPath,
    original.replace(currentImplementation, patchedImplementation),
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), scriptPath)}`,
  );
  return true;
}

function patchProductionBuildRootResolution(appCoreDir) {
  const scriptPath = path.join(appCoreDir, "scripts/run-production-build.mjs");
  if (!fs.existsSync(scriptPath)) {
    return false;
  }

  const original = fs.readFileSync(scriptPath, "utf8");
  // Upstream derives the repo root by walking a fixed number of parents up from
  // the script. That only holds when app-core IS the monorepo root (local /
  // source mode). When app-core is an installed dependency (packages mode), the
  // walk lands inside the bun store (e.g. node_modules/.bun/@elizaos+app-core@…)
  // instead of the consuming repo, so `appDir` resolves to a directory that does
  // not exist. The native-plugin build then spawns Node with that bogus `cwd`,
  // and Node surfaces it as `spawn <node> ENOENT` (the cwd, not the executable,
  // is missing), failing `bun run build` in CI. run-eliza-app-core-script.mjs
  // already invokes this build with cwd === the milady repo root and exports
  // MILADY_REPO_ROOT, so anchor rootDir to that authoritative root whenever the
  // walk-up lands inside node_modules.
  const currentImplementation = `const rootDir = path.resolve(scriptDir, "..", "..", "..", "..");`;
  const patchedImplementation = `const __walkUpRootDir = path.resolve(scriptDir, "..", "..", "..", "..");
const __consumingRepoRoot = (
  process.env.MILADY_REPO_ROOT?.trim() ||
  process.env.ELIZA_REPO_ROOT?.trim() ||
  process.cwd()
);
// When app-core is an installed dependency the fixed walk-up lands inside
// node_modules; fall back to the repo root the build was launched from.
const rootDir = __walkUpRootDir.split(path.sep).includes("node_modules")
  ? path.resolve(__consumingRepoRoot)
  : __walkUpRootDir;`;

  if (original.includes(patchedImplementation)) {
    return false;
  }

  if (!original.includes(currentImplementation)) {
    return false;
  }

  fs.writeFileSync(
    scriptPath,
    original.replace(currentImplementation, patchedImplementation),
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), scriptPath)}`,
  );
  return true;
}

function patchProductionBuildTsdownResolution(appCoreDir) {
  const scriptPath = path.join(appCoreDir, "scripts/run-production-build.mjs");
  if (!fs.existsSync(scriptPath)) {
    return false;
  }

  const original = fs.readFileSync(scriptPath, "utf8");
  const currentImplementation = `function resolveTsdownCli() {
  const p = path.join(rootDir, "node_modules", "tsdown", "dist", "run.mjs");
  if (!fs.existsSync(p)) {
    throw new Error("tsdown not found under node_modules; run bun install");
  }
  return p;
}`;
  const patchedImplementation = `function resolveTsdownCli() {
  const candidates = [
    path.join(rootDir, "node_modules", "tsdown", "dist", "run.mjs"),
    path.join(process.cwd(), "node_modules", "tsdown", "dist", "run.mjs"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("tsdown not found under node_modules; run bun install");
}`;

  if (original.includes(patchedImplementation)) {
    return false;
  }

  if (!original.includes(currentImplementation)) {
    return false;
  }

  fs.writeFileSync(
    scriptPath,
    original.replace(currentImplementation, patchedImplementation),
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), scriptPath)}`,
  );
  return true;
}

function patchProductionBuildViteResolution(appCoreDir) {
  const scriptPath = path.join(appCoreDir, "scripts/run-production-build.mjs");
  if (!fs.existsSync(scriptPath)) {
    return false;
  }

  const original = fs.readFileSync(scriptPath, "utf8");
  const currentImplementation = `function resolveViteCli() {
  for (const base of [appDir, rootDir]) {
    const p = path.join(base, "node_modules", "vite", "bin", "vite.js");
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("vite CLI not found; run bun install");
}`;
  const patchedImplementation = `function resolveViteCli() {
  for (const base of [appDir, rootDir, process.cwd()]) {
    const p = path.join(base, "node_modules", "vite", "bin", "vite.js");
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error("vite CLI not found; run bun install");
}`;

  if (original.includes(patchedImplementation)) {
    return false;
  }

  if (!original.includes(currentImplementation)) {
    return false;
  }

  fs.writeFileSync(
    scriptPath,
    original.replace(currentImplementation, patchedImplementation),
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), scriptPath)}`,
  );
  return true;
}

function patchProductionBuildNodeResolution(appCoreDir) {
  const scriptPath = path.join(appCoreDir, "scripts/run-production-build.mjs");
  if (!fs.existsSync(scriptPath)) {
    return false;
  }

  const original = fs.readFileSync(scriptPath, "utf8");
  // GitHub-hosted runners can expose a stale absolute process.execPath through
  // the Bun-launched script environment. Validate explicit and reported Node
  // paths before using them, and fall back to PATH lookup so package-mode builds
  // can still spawn tsdown/Vite when the setup-node shim moved.
  const currentImplementation = `/** Real Node binary — when the script is started via \`bun run\`, process.execPath is Bun. */
function resolveNodeExec() {
  if (!process.versions.bun) {
    return process.execPath;
  }
  const probe = spawnSync(
    "node",
    ["-e", "process.stdout.write(process.execPath)"],
    {
      encoding: "utf8",
    },
  );
  const out = probe.stdout?.trim();
  if (probe.status === 0 && out) {
    return out;
  }
  throw new Error(
    "Node.js is required to run this build (tsx + Vite CLI). Install Node 22+ or run: node scripts/run-production-build.mjs",
  );
}`;
  const patchedImplementation = `/** Real Node binary — when the script is started via \`bun run\`, process.execPath is Bun. */
function resolveNodeExec() {
  const candidates = [
    process.env.ELIZA_NODE_PATH?.trim(),
    process.env.MILADY_NODE_PATH?.trim(),
    !process.versions.bun ? process.execPath : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "node" || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const probe = spawnSync(
    "node",
    ["-e", "process.stdout.write(process.execPath)"],
    {
      encoding: "utf8",
    },
  );
  const out = probe.stdout?.trim();
  if (probe.status === 0 && out && fs.existsSync(out)) {
    return out;
  }
  if (probe.status === 0) {
    return "node";
  }
  throw new Error(
    "Node.js is required to run this build (tsx + Vite CLI). Install Node 22+ or run: node scripts/run-production-build.mjs",
  );
}`;

  if (original.includes(patchedImplementation)) {
    return false;
  }

  if (!original.includes(currentImplementation)) {
    return false;
  }

  fs.writeFileSync(
    scriptPath,
    original.replace(currentImplementation, patchedImplementation),
  );
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), scriptPath)}`,
  );
  return true;
}

const appCoreDirs = collectAppCorePackageDirs();
if (appCoreDirs.length === 0) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

let patched = 0;
for (const appCoreDir of appCoreDirs) {
  if (patchStylesheet(appCoreDir)) {
    patched += 1;
  }
  if (patchNativePluginsRootResolution(appCoreDir)) {
    patched += 1;
  }
  if (patchProductionBuildRootResolution(appCoreDir)) {
    patched += 1;
  }
  if (patchProductionBuildTsdownResolution(appCoreDir)) {
    patched += 1;
  }
  if (patchProductionBuildViteResolution(appCoreDir)) {
    patched += 1;
  }
  if (patchProductionBuildNodeResolution(appCoreDir)) {
    patched += 1;
  }
}

if (patched === 0) {
  console.log(`${LOG_PREFIX} package stylesheet already compatible.`);
}
