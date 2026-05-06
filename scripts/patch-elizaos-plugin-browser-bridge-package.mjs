#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_PREFIX = "[patch-elizaos-plugin-browser-bridge-package]";
const packageName = "@elizaos/plugin-browser-bridge";
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nodeModulesDir = path.join(repoRoot, "node_modules");
const rootPackageDir = path.join(
  nodeModulesDir,
  "@elizaos/plugin-browser-bridge",
);
const defaultExportsMap = {
  "./package.json": "./package.json",
  ".": "./stub.js",
  "./schema": "./stub.js",
  "./contracts": "./stub.js",
  "./packaging": "./stub.js",
  "./routes": "./stub.js",
  "./service": "./stub.js",
  "./actions": "./stub.js",
  "./plugin": "./stub.js",
};

const stubSource = `const action = Object.freeze({
  name: "BROWSER_BRIDGE_UNAVAILABLE",
  description: "Agent Browser Bridge is unavailable in this packaged alpha build.",
  validate: async () => false,
  handler: async () => ({
    text: "Agent Browser Bridge is unavailable in this packaged alpha build.",
    success: false,
    values: { success: false, error: "BROWSER_BRIDGE_UNAVAILABLE" },
    data: { error: "BROWSER_BRIDGE_UNAVAILABLE" },
  }),
  parameters: [],
  examples: [],
});

export const BROWSER_BRIDGE_ROUTE_SERVICE_TYPE = "browser-bridge-route-service";
export const browserBridgeActions = [];
export const browserBridgeInstallAction = action;
export const browserBridgeOpenManagerAction = action;
export const browserBridgePlugin = Object.freeze({
  name: "@elizaos/plugin-browser-bridge",
  description: "Agent Browser Bridge placeholder for packaged alpha builds.",
  actions: [],
  routes: [],
});
export const browserBridgeRefreshAction = action;
export const browserBridgeRevealFolderAction = action;
export const browserBridgeSchema = {};

export async function buildBrowserBridgeCompanionPackage() {
  return {};
}
export function getBrowserBridgeCompanionPackageStatus() {
  return {};
}
export async function handleBrowserBridgeRoutes() {
  return false;
}
export async function openBrowserBridgeCompanionManager() {
  return false;
}
export async function openBrowserBridgeCompanionPackagePath() {
  return { path: "" };
}

export default browserBridgePlugin;
`;

// Type declarations matching the JS stub. The published @elizaos/plugin-browser-bridge
// package has TypeScript sources in its exports map; we replace those with a JS stub
// for packaged alpha builds, but consumers (e.g. eliza/packages/agent/src/runtime/eliza.ts)
// still type-import this module — so emit a matching .d.ts to keep typecheck green.
const stubTypesSource = `import type { Action, Plugin } from "@elizaos/core";

export const BROWSER_BRIDGE_ROUTE_SERVICE_TYPE: "browser-bridge-route-service";
export const browserBridgeActions: readonly Action[];
export const browserBridgeInstallAction: Action;
export const browserBridgeOpenManagerAction: Action;
export const browserBridgePlugin: Plugin;
export const browserBridgeRefreshAction: Action;
export const browserBridgeRevealFolderAction: Action;
export const browserBridgeSchema: Record<string, unknown>;

export function buildBrowserBridgeCompanionPackage(): Promise<Record<string, unknown>>;
export function getBrowserBridgeCompanionPackageStatus(): Record<string, unknown>;
export function handleBrowserBridgeRoutes(): Promise<boolean>;
export function openBrowserBridgeCompanionManager(): Promise<boolean>;
export function openBrowserBridgeCompanionPackagePath(): Promise<{ path: string }>;

declare const _default: Plugin;
export default _default;
`;

function isLocalElizaSymlink(packageDir) {
  try {
    const stat = fs.lstatSync(packageDir);
    if (!stat.isSymbolicLink()) return false;
    const target = fs.readlinkSync(packageDir);
    return target.includes("/eliza/") || target.includes("\\eliza\\");
  } catch {
    return false;
  }
}

function packageDirsInBunStore() {
  const bunDir = path.join(nodeModulesDir, ".bun");
  if (!fs.existsSync(bunDir)) return [];
  return fs
    .readdirSync(bunDir)
    .filter((entry) => entry.startsWith("@elizaos+plugin-browser-bridge@"))
    .map((entry) =>
      path.join(bunDir, entry, "node_modules/@elizaos/plugin-browser-bridge"),
    )
    .filter((dir) => fs.existsSync(path.join(dir, "package.json")));
}

function needsPatch(packageJson) {
  const exportsMap = packageJson.exports ?? {};
  const exportValues = Object.values(exportsMap).filter(
    (value) => typeof value === "string",
  );
  // Re-patch if exports still point at TypeScript sources (alpha
  // tarballs ship .ts in exports), or if a previous patch stubbed the
  // package without writing .d.ts — older patch revisions emitted
  // stub.js only, leaving consumers' typecheck broken with TS7016.
  return (
    packageJson.main?.endsWith(".ts") ||
    exportValues.some((value) => value.endsWith(".ts")) ||
    !packageJson.types
  );
}

function writeStubPackage(packageDir, existingPackageJson = {}) {
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "stub.js"), stubSource);
  fs.writeFileSync(path.join(packageDir, "stub.d.ts"), stubTypesSource);
  const packageJson = {
    ...existingPackageJson,
    name: packageName,
    version: existingPackageJson.version ?? "0.0.0-milady-stub",
    type: "module",
    main: "./stub.js",
    types: "./stub.d.ts",
    exports: {
      ...defaultExportsMap,
      ...existingPackageJson.exports,
    },
  };
  // Conditional export form so resolvers pick the .d.ts for type imports
  // and the .js for runtime — without this, TypeScript sees the JS stub
  // as having implicit `any` (TS7016).
  for (const key of Object.keys(packageJson.exports)) {
    if (key === "./package.json") continue;
    packageJson.exports[key] = {
      types: "./stub.d.ts",
      default: "./stub.js",
    };
  }
  fs.writeFileSync(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

let patchedCount = 0;

if (isLocalElizaSymlink(rootPackageDir)) {
  fs.unlinkSync(rootPackageDir);
  writeStubPackage(rootPackageDir);
  patchedCount += 1;
} else if (fs.existsSync(path.join(rootPackageDir, "package.json"))) {
  // Root is a real directory (a previous patch overwrote the symlink with
  // a stub). Re-patch in place if we're missing newer fields (types,
  // conditional exports) so the d.ts upgrade lands on the path TypeScript
  // actually resolves through.
  const rootPackageJson = JSON.parse(
    fs.readFileSync(path.join(rootPackageDir, "package.json"), "utf8"),
  );
  if (needsPatch(rootPackageJson)) {
    writeStubPackage(rootPackageDir, rootPackageJson);
    patchedCount += 1;
  }
}

for (const packageDir of packageDirsInBunStore()) {
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!needsPatch(packageJson)) continue;
  writeStubPackage(packageDir, packageJson);
  patchedCount += 1;
}

if (patchedCount === 0) {
  console.log(`${LOG_PREFIX} package exports already use JavaScript.`);
} else {
  console.log(
    `${LOG_PREFIX} replaced TypeScript/local exports with JS stubs in ${patchedCount} package location(s).`,
  );
}
