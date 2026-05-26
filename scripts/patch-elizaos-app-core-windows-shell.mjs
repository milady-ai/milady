#!/usr/bin/env node

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const LOG_PREFIX = "[patch-elizaos-app-core-windows-shell]";

function resolvePackageDir(packageName) {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return null;
  }
}

function replaceIfPresent(text, before, after) {
  if (text.includes(after)) {
    return text;
  }
  if (!text.includes(before)) {
    return text;
  }
  return text.replace(before, after);
}

function ensureContains(text, marker, filePath) {
  if (!text.includes(marker)) {
    throw new Error(
      `${LOG_PREFIX} expected marker not found in ${filePath}: ${marker}`,
    );
  }
}

const REQUEST_BODY_BROWSER_FALLBACK_EXPORTS = [
  "export const DEFAULT_MAX_BODY_BYTES = 1_048_576;",
  "export const readRequestBodyBuffer = async () => null;",
  "export const readRequestBody = async () => null;",
];

function removeRequestBodyFallbackExports(text) {
  const duplicateMarkers = new Set([
    "// @elizaos/agent request-body browser fallback",
    ...REQUEST_BODY_BROWSER_FALLBACK_EXPORTS,
  ]);
  return text
    .split("\n")
    .filter((line) => !duplicateMarkers.has(line.trim()))
    .join("\n");
}

function patchDevPlatform(devPlatformPath) {
  let next = fs.readFileSync(devPlatformPath, "utf8");
  const original = next;

  next = replaceIfPresent(
    next,
    'import { execSync, spawn } from "node:child_process";',
    'import { spawn, spawnSync } from "node:child_process";',
  );

  next = replaceIfPresent(
    next,
    'const here = path.dirname(fileURLToPath(import.meta.url));\nconst _elizaRoot = path.resolve(here, "../../..");',
    'const here = path.dirname(fileURLToPath(import.meta.url));\nconst packageRoot = path.resolve(here, "..");\nconst _elizaRoot = path.resolve(here, "../../..");',
  );

  next = replaceIfPresent(
    next,
    "const bundleRoot = isElizaMonorepo ? elizaRoot : elizaRoot;",
    "const bundleRoot = isElizaMonorepo ? elizaRoot : path.resolve(process.cwd());",
  );

  next = replaceIfPresent(
    next,
    `  return path.join(\n    elizaRoot,\n    "packages",\n    "app-core",\n    "platforms",\n    "electrobun",\n  );`,
    `  return path.join(\n    bundleRoot,\n    "apps",\n    "app",\n    "electrobun",\n  );`,
  );

  next = replaceIfPresent(
    next,
    'const devServerEntry = isElizaMonorepo\n  ? "eliza/packages/app-core/src/runtime/dev-server.ts"\n  : "packages/app-core/src/runtime/dev-server.ts";',
    `const devServerEntry = isElizaMonorepo\n  ? "eliza/packages/app-core/src/runtime/dev-server.ts"\n  : path\n      .relative(\n        bundleRoot,\n        path.join(\n          packageRoot,\n          "packages",\n          "app-core",\n          "src",\n          "runtime",\n          "dev-server.js",\n        ),\n      )\n      .replaceAll(path.sep, "/");`,
  );

  next = replaceIfPresent(
    next,
    'const BUN_EXECUTABLE = process.versions?.bun ? process.execPath : "bun";',
    `const resolvedBunInstallHome =\n  process.env.BUN_INSTALL ||\n  process.env.HOME?.trim() ||\n  process.env.USERPROFILE?.trim() ||\n  null;\nconst BUN_EXECUTABLE = process.versions?.bun\n  ? process.execPath\n  : resolvedBunInstallHome\n    ? path.join(\n        resolvedBunInstallHome,\n        ".bun",\n        "bin",\n        process.platform === "win32" ? "bun.exe" : "bun",\n      )\n    : "bun";`,
  );

  next = replaceIfPresent(
    next,
    `    execSync("bun run build:whisper", {\n      cwd: electrobunDir,\n      stdio: "inherit",\n    });`,
    `    const whisperBuild = spawnSync(BUN_EXECUTABLE, ["run", "build:whisper"], {\n      cwd: electrobunDir,\n      stdio: "inherit",\n    });\n    if (whisperBuild.status !== 0) {\n      throw new Error(\`build:whisper exited with code \${whisperBuild.status ?? 1}\`);\n    }`,
  );

  next = replaceIfPresent(
    next,
    '  execSync("bun run vite build", { cwd: appDir, stdio: "inherit" });',
    `  const viteBuild = spawnSync(BUN_EXECUTABLE, ["run", "vite", "build"], {\n    cwd: appDir,\n    stdio: "inherit",\n  });\n  if (viteBuild.status !== 0) {\n    throw new Error(\`vite build exited with code \${viteBuild.status ?? 1}\`);\n  }`,
  );

  next = replaceIfPresent(
    next,
    '  execSync("bunx tsdown", { cwd: bundleRoot, stdio: "inherit" });',
    `  const tsdownBuild = spawnSync(BUN_EXECUTABLE, ["x", "tsdown"], {\n    cwd: bundleRoot,\n    stdio: "inherit",\n  });\n  if (tsdownBuild.status !== 0) {\n    throw new Error(\`tsdown exited with code \${tsdownBuild.status ?? 1}\`);\n  }`,
  );

  ensureContains(
    next,
    'const packageRoot = path.resolve(here, "..");',
    devPlatformPath,
  );
  ensureContains(
    next,
    "const bundleRoot = isElizaMonorepo ? elizaRoot : path.resolve(process.cwd());",
    devPlatformPath,
  );
  ensureContains(
    next,
    'const whisperBuild = spawnSync(BUN_EXECUTABLE, ["run", "build:whisper"], {',
    devPlatformPath,
  );
  ensureContains(
    next,
    'const viteBuild = spawnSync(BUN_EXECUTABLE, ["run", "vite", "build"], {',
    devPlatformPath,
  );
  ensureContains(
    next,
    'const tsdownBuild = spawnSync(BUN_EXECUTABLE, ["x", "tsdown"], {',
    devPlatformPath,
  );
  ensureContains(next, '".bun",', devPlatformPath);

  next = replaceIfPresent(
    next,
    'const viteWatch =\n  process.env.ELIZA_DESKTOP_VITE_WATCH === "1" ||\n  process.env.ELIZA_DESKTOP_VITE_WATCH === "1";',
    'const viteWatch =\n  process.env.ELIZA_DESKTOP_VITE_WATCH === "1" ||\n  process.env.MILADY_DESKTOP_VITE_WATCH === "1";',
  );

  next = replaceIfPresent(
    next,
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1" ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1");',
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1" ||\n    process.env.MILADY_DESKTOP_VITE_BUILD_WATCH === "1");',
  );

  ensureContains(
    next,
    'process.env.MILADY_DESKTOP_VITE_WATCH === "1"',
    devPlatformPath,
  );
  ensureContains(
    next,
    'process.env.MILADY_DESKTOP_VITE_BUILD_WATCH === "1"',
    devPlatformPath,
  );

  if (next !== original) {
    fs.writeFileSync(devPlatformPath, next);
  }

  return next !== original;
}

function patchWalletHydrate(walletHydratePath) {
  let next = fs.readFileSync(walletHydratePath, "utf8");
  const original = next;

  next = replaceIfPresent(
    next,
    "async function migrateOsStoreWalletKeysIntoVault(envKeys) {",
    "async function migrateOsStoreWalletKeysIntoVault(envKeys, opts = {}) {",
  );

  next = replaceIfPresent(
    next,
    `        if (!(await vault.has(envKey))) {\n            await vault.set(envKey, got.value, {\n                sensitive: true,\n                caller: "wallet-os-store-migrate",\n            });\n            migrated.push(String(envKey));\n        }`,
    `        const shouldOverwrite = opts.overwriteVaultKeys?.has(envKey) ?? false;\n        if (shouldOverwrite || !(await vault.has(envKey))) {\n            await vault.set(envKey, got.value, {\n                sensitive: true,\n                caller: "wallet-os-store-migrate",\n            });\n            migrated.push(String(envKey));\n        }`,
  );

  next = replaceIfPresent(
    next,
    "    const missingWalletKeys = [];",
    "    const missingWalletKeys = [];\n    const unreadableWalletKeys = new Set();",
  );

  next = replaceIfPresent(
    next,
    `        if (await vault.has(envKey)) {\n            const value = await vault.reveal(envKey, "wallet-hydrate-boot");\n            process.env[envKey] = value;\n            continue;\n        }`,
    `        if (await vault.has(envKey)) {\n            try {\n                const value = await vault.reveal(envKey, "wallet-hydrate-boot");\n                process.env[envKey] = value;\n            }\n            catch (err) {\n                unreadableWalletKeys.add(envKey);\n                missingWalletKeys.push(envKey);\n                logger.warn(\`[wallet][vault] failed to reveal \${envKey}: \${err instanceof Error ? err.message : String(err)}. Will try legacy OS-store recovery if available.\`);\n            }\n            continue;\n        }`,
  );

  next = replaceIfPresent(
    next,
    "            const migrated = await migrateOsStoreWalletKeysIntoVault(missingWalletKeys);",
    `            const migrated = await migrateOsStoreWalletKeysIntoVault(missingWalletKeys, {\n                overwriteVaultKeys: unreadableWalletKeys,\n            });`,
  );

  ensureContains(
    next,
    "const unreadableWalletKeys = new Set();",
    walletHydratePath,
  );
  ensureContains(
    next,
    "overwriteVaultKeys: unreadableWalletKeys,",
    walletHydratePath,
  );
  ensureContains(
    next,
    "Will try legacy OS-store recovery if available.",
    walletHydratePath,
  );

  if (next !== original) {
    fs.writeFileSync(walletHydratePath, next);
  }

  return next !== original;
}

function patchEmptyNodeModule(emptyNodeModulePath) {
  let next = fs.readFileSync(emptyNodeModulePath, "utf8");
  const original = next;
  const telemetryFallback = `export const createIntegrationTelemetrySpan = () => ({\n    success: () => { },\n    failure: () => { },\n});`;

  next = removeRequestBodyFallbackExports(next);
  next = replaceIfPresent(
    next,
    telemetryFallback,
    `${telemetryFallback}\n${REQUEST_BODY_BROWSER_FALLBACK_EXPORTS.join("\n")}`,
  );

  for (const marker of REQUEST_BODY_BROWSER_FALLBACK_EXPORTS) {
    ensureContains(next, marker, emptyNodeModulePath);
  }

  if (next !== original) {
    fs.writeFileSync(emptyNodeModulePath, next);
  }

  return next !== original;
}

function patchWindowShellRoute(windowShellPath, windowShellTypesPath) {
  let patched = false;

  const jsOriginal = fs.readFileSync(windowShellPath, "utf8");
  let jsNext = jsOriginal;

  jsNext = replaceIfPresent(
    jsNext,
    `    if (shell === "surface") {`,
    `    if (shell === "pill") {
        return { mode: "pill" };
    }
    if (shell === "surface") {`,
  );
  jsNext = replaceIfPresent(
    jsNext,
    `export function isDetachedWindowShell(route) {
    return route.mode !== "main";
}`,
    `export function isDetachedWindowShell(route) {
    return route.mode !== "main" && route.mode !== "pill";
}
export function isPillWindowShell(route) {
    return route.mode === "pill";
}`,
  );
  jsNext = replaceIfPresent(
    jsNext,
    `export function shouldInstallMainWindowOnboardingPatches(route) {
    return route.mode === "main";
}`,
    `export function shouldInstallMainWindowOnboardingPatches(route) {
    return route.mode === "main";
}
export function shouldInstallMainWindowFirstRunPatches(route) {
    return route.mode === "main";
}`,
  );
  jsNext = replaceIfPresent(
    jsNext,
    `    if (route.mode === "main") {
        throw new Error("Main windows do not have a detached shell target");
    }`,
    `    if (route.mode === "main") {
        throw new Error("Main windows do not have a detached shell target");
    }
    if (route.mode === "pill") {
        throw new Error("Pill windows do not have a detached shell target");
    }`,
  );
  jsNext = replaceIfPresent(
    jsNext,
    `    if (route.mode === "main") {
        return false;
    }`,
    `    if (route.mode === "main" || route.mode === "pill") {
        return false;
    }`,
  );

  ensureContains(jsNext, 'return { mode: "pill" };', windowShellPath);
  ensureContains(
    jsNext,
    "export function shouldInstallMainWindowFirstRunPatches(route) {",
    windowShellPath,
  );
  ensureContains(
    jsNext,
    'return route.mode !== "main" && route.mode !== "pill";',
    windowShellPath,
  );

  if (jsNext !== jsOriginal) {
    fs.writeFileSync(windowShellPath, jsNext);
    patched = true;
  }

  const dtsOriginal = fs.readFileSync(windowShellTypesPath, "utf8");
  let dtsNext = dtsOriginal;

  dtsNext = replaceIfPresent(
    dtsNext,
    `} | {
    mode: "surface";
    tab: DetachedSurfaceTab;
};`,
    `} | {
    mode: "surface";
    tab: DetachedSurfaceTab;
} | {
    mode: "pill";
};`,
  );
  dtsNext = replaceIfPresent(
    dtsNext,
    `export declare function isDetachedWindowShell(route: WindowShellRoute): route is Exclude<WindowShellRoute, {
    mode: "main";
}>;`,
    `export declare function isDetachedWindowShell(route: WindowShellRoute): route is Exclude<WindowShellRoute, {
    mode: "main";
} | {
    mode: "pill";
}>;
export declare function isPillWindowShell(route: WindowShellRoute): route is Extract<WindowShellRoute, {
    mode: "pill";
}>;`,
  );
  dtsNext = replaceIfPresent(
    dtsNext,
    "export declare function shouldInstallMainWindowOnboardingPatches(route: WindowShellRoute): boolean;",
    "export declare function shouldInstallMainWindowOnboardingPatches(route: WindowShellRoute): boolean;\nexport declare function shouldInstallMainWindowFirstRunPatches(route: WindowShellRoute): boolean;",
  );

  ensureContains(dtsNext, 'mode: "pill";', windowShellTypesPath);
  ensureContains(
    dtsNext,
    "shouldInstallMainWindowFirstRunPatches",
    windowShellTypesPath,
  );

  if (dtsNext !== dtsOriginal) {
    fs.writeFileSync(windowShellTypesPath, dtsNext);
    patched = true;
  }

  return patched;
}

const firstRunResetSource = `
const SETUP_STEP_STORAGE_KEY = "eliza:setup:step";
const FIRST_RUN_COMPLETE_STORAGE_KEY = "eliza:first-run-complete";
const FORCE_FRESH_FIRST_RUN_STORAGE_KEY = "elizaos:first-run:force-fresh";
const FIRST_RUN_PATCH_STATE = Symbol.for("elizaos.forceFreshFirstRunPatch");
export function isForceFreshFirstRunEnabled(storage) {
    const resolvedStorage = getStorage(storage);
    if (!resolvedStorage) {
        return false;
    }
    try {
        return resolvedStorage.getItem(FORCE_FRESH_FIRST_RUN_STORAGE_KEY) === "1";
    }
    catch {
        return false;
    }
}
export function enableForceFreshFirstRun(storage) {
    const resolvedStorage = getStorage(storage);
    if (!resolvedStorage) {
        return;
    }
    try {
        resolvedStorage.setItem(FORCE_FRESH_FIRST_RUN_STORAGE_KEY, "1");
    }
    catch {
    }
}
export function clearForceFreshFirstRun(storage) {
    const resolvedStorage = getStorage(storage);
    if (!resolvedStorage) {
        return;
    }
    try {
        resolvedStorage.removeItem(FORCE_FRESH_FIRST_RUN_STORAGE_KEY);
    }
    catch {
    }
}
export function applyForceFreshFirstRunReset(args) {
    const resolvedStorage = getStorage(args?.storage);
    const resolvedUrl = args?.url ??
        (typeof window !== "undefined" ? new URL(window.location.href) : null);
    const resolvedHistory = args?.history ?? (typeof window !== "undefined" ? window.history : null);
    if (!resolvedUrl?.searchParams.has(RESET_QUERY_PARAM)) {
        return false;
    }
    if (resolvedStorage) {
        try {
            resolvedStorage.removeItem(ACTIVE_SERVER_STORAGE_KEY);
            resolvedStorage.removeItem(SETUP_STEP_STORAGE_KEY);
            resolvedStorage.removeItem(FIRST_RUN_COMPLETE_STORAGE_KEY);
            resolvedStorage.setItem(FORCE_FRESH_FIRST_RUN_STORAGE_KEY, "1");
        }
        catch {
        }
    }
    if (typeof window !== "undefined") {
        try {
            window.localStorage.removeItem("elizaos_api_base");
            window.sessionStorage.removeItem("elizaos_api_base");
        }
        catch {
        }
    }
    resolvedUrl.searchParams.delete(RESET_QUERY_PARAM);
    resolvedHistory?.replaceState(null, "", resolvedUrl.toString());
    return true;
}
export function installForceFreshFirstRunClientPatch(client, storage) {
    const patchableClient = client;
    const existingPatch = patchableClient[FIRST_RUN_PATCH_STATE];
    if (existingPatch) {
        return () => { };
    }
    const originalGetConfig = client.getConfig.bind(client);
    const originalGetFirstRunStatus = client.getFirstRunStatus.bind(client);
    const originalSubmitFirstRun = client.submitFirstRun.bind(client);
    patchableClient[FIRST_RUN_PATCH_STATE] = {
        getConfig: client.getConfig,
        getFirstRunStatus: client.getFirstRunStatus,
        submitFirstRun: client.submitFirstRun,
    };
    client.getConfig = async () => {
        if (isForceFreshFirstRunEnabled(storage)) {
            return {};
        }
        return originalGetConfig();
    };
    client.getFirstRunStatus = async () => {
        const status = await originalGetFirstRunStatus();
        if (!isForceFreshFirstRunEnabled(storage)) {
            return status;
        }
        return { ...status, complete: false };
    };
    client.submitFirstRun = async (...args) => {
        await originalSubmitFirstRun(...args);
        clearForceFreshFirstRun(storage);
    };
    return () => {
        const patchState = patchableClient[FIRST_RUN_PATCH_STATE];
        if (!patchState) {
            return;
        }
        client.getConfig = patchState.getConfig;
        client.getFirstRunStatus = patchState.getFirstRunStatus;
        client.submitFirstRun = patchState.submitFirstRun;
        delete patchableClient[FIRST_RUN_PATCH_STATE];
    };
}
`;

const firstRunResetTypesSource = `
type FirstRunClientLike = {
    getConfig: () => Promise<Record<string, unknown>>;
    getFirstRunStatus: () => Promise<{ complete: boolean } & Record<string, unknown>>;
    submitFirstRun: (...args: readonly unknown[]) => Promise<unknown>;
};
export declare function isForceFreshFirstRunEnabled(storage?: StorageLike | null): boolean;
export declare function enableForceFreshFirstRun(storage?: StorageLike | null): void;
export declare function clearForceFreshFirstRun(storage?: StorageLike | null): void;
export declare function applyForceFreshFirstRunReset(args?: {
    url?: URL;
    storage?: StorageLike | null;
    history?: HistoryLike | null;
}): boolean;
export declare function installForceFreshFirstRunClientPatch(client: FirstRunClientLike, storage?: StorageLike | null): () => void;
`;

function patchFirstRunReset(onboardingResetPath, onboardingResetTypesPath) {
  let patched = false;

  const jsOriginal = fs.readFileSync(onboardingResetPath, "utf8");
  if (!jsOriginal.includes("applyForceFreshFirstRunReset")) {
    fs.writeFileSync(
      onboardingResetPath,
      `${jsOriginal.trimEnd()}\n${firstRunResetSource}`,
    );
    patched = true;
  }

  const dtsOriginal = fs.readFileSync(onboardingResetTypesPath, "utf8");
  if (!dtsOriginal.includes("applyForceFreshFirstRunReset")) {
    fs.writeFileSync(
      onboardingResetTypesPath,
      `${dtsOriginal.trimEnd()}\n${firstRunResetTypesSource}`,
    );
    patched = true;
  }

  return patched;
}

function findBunAppCorePackageDirs(primaryDir) {
  const bunDir = path.join(process.cwd(), "node_modules", ".bun");
  if (!fs.existsSync(bunDir)) {
    return [];
  }

  return fs
    .readdirSync(bunDir)
    .filter((entry) => entry.startsWith("@elizaos+app-core@"))
    .map((entry) =>
      path.join(bunDir, entry, "node_modules", "@elizaos", "app-core"),
    )
    .filter(
      (candidate) =>
        candidate !== primaryDir &&
        fs.existsSync(path.join(candidate, "package.json")),
    );
}

function resolvePackagedAppCoreDirs(appCoreDir) {
  const dirs = [appCoreDir, ...findBunAppCorePackageDirs(appCoreDir)];
  const seen = new Set();
  return dirs.filter((dir) => {
    const real = fs.realpathSync(dir);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

function appCorePackagePath(packageDir, relativePath) {
  return path.join(packageDir, "packages", "app-core", "src", relativePath);
}

const appCoreDir = resolvePackageDir("@elizaos/app-core");
if (!appCoreDir) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

const patchedPackages = [];
let skippedPackages = 0;

for (const packageDir of resolvePackagedAppCoreDirs(appCoreDir)) {
  const devPlatformPath = path.join(packageDir, "scripts", "dev-platform.mjs");
  const walletHydratePath = appCorePackagePath(
    packageDir,
    "security/hydrate-wallet-keys-from-platform-store.js",
  );
  const emptyNodeModulePath = appCorePackagePath(
    packageDir,
    "platform/empty-node-module.js",
  );
  const onboardingResetPath = appCorePackagePath(
    packageDir,
    "platform/onboarding-reset.js",
  );
  const onboardingResetTypesPath = appCorePackagePath(
    packageDir,
    "platform/onboarding-reset.d.ts",
  );
  const windowShellPath = appCorePackagePath(
    packageDir,
    "platform/window-shell.js",
  );
  const windowShellTypesPath = appCorePackagePath(
    packageDir,
    "platform/window-shell.d.ts",
  );

  const requiredPaths = [
    devPlatformPath,
    walletHydratePath,
    emptyNodeModulePath,
    onboardingResetPath,
    onboardingResetTypesPath,
    windowShellPath,
    windowShellTypesPath,
  ];
  if (requiredPaths.some((requiredPath) => !fs.existsSync(requiredPath))) {
    skippedPackages += 1;
    continue;
  }

  const patched = [
    patchDevPlatform(devPlatformPath),
    patchWalletHydrate(walletHydratePath),
    patchEmptyNodeModule(emptyNodeModulePath),
    patchFirstRunReset(onboardingResetPath, onboardingResetTypesPath),
    patchWindowShellRoute(windowShellPath, windowShellTypesPath),
  ];

  if (patched.some(Boolean)) {
    patchedPackages.push(path.relative(process.cwd(), packageDir));
  }
}

if (patchedPackages.length > 0) {
  console.log(
    `${LOG_PREFIX} patched package files in ${patchedPackages.join(", ")}`,
  );
} else {
  const suffix =
    skippedPackages > 0
      ? ` (${skippedPackages} local/source package dir(s) skipped)`
      : "";
  console.log(`${LOG_PREFIX} package files already compatible${suffix}.`);
}
