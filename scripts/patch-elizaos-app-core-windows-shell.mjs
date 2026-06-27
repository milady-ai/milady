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
    'const viteWatch = process.env.ELIZA_DESKTOP_VITE_WATCH === "1";',
  );
  next = replaceIfPresent(
    next,
    'const viteWatch =\n  process.env.ELIZA_DESKTOP_VITE_WATCH === "1" ||\n  process.env.MILADY_DESKTOP_VITE_WATCH === "1";',
    'const viteWatch = process.env.ELIZA_DESKTOP_VITE_WATCH === "1";',
  );

  next = replaceIfPresent(
    next,
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1" ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1");',
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1");',
  );
  next = replaceIfPresent(
    next,
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1" ||\n    process.env.MILADY_DESKTOP_VITE_BUILD_WATCH === "1");',
    'const viteRollupWatch =\n  viteWatch &&\n  (viteRollupWatchCli ||\n    process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1");',
  );

  ensureContains(
    next,
    'const viteWatch = process.env.ELIZA_DESKTOP_VITE_WATCH === "1";',
    devPlatformPath,
  );
  ensureContains(
    next,
    'process.env.ELIZA_DESKTOP_VITE_BUILD_WATCH === "1"',
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

const appCoreDir = resolvePackageDir("@elizaos/app-core");
if (!appCoreDir) {
  console.warn(`${LOG_PREFIX} @elizaos/app-core is not installed; skipping.`);
  process.exit(0);
}

const devPlatformPath = path.join(appCoreDir, "scripts", "dev-platform.mjs");
const walletHydratePath = path.join(
  appCoreDir,
  "packages",
  "app-core",
  "src",
  "security",
  "hydrate-wallet-keys-from-platform-store.js",
);
const emptyNodeModulePath = path.join(
  appCoreDir,
  "packages",
  "app-core",
  "src",
  "platform",
  "empty-node-module.js",
);

for (const requiredPath of [
  devPlatformPath,
  walletHydratePath,
  emptyNodeModulePath,
]) {
  if (!fs.existsSync(requiredPath)) {
    console.warn(`${LOG_PREFIX} ${requiredPath} does not exist; skipping.`);
    process.exit(0);
  }
}

const patched = [
  patchDevPlatform(devPlatformPath),
  patchWalletHydrate(walletHydratePath),
  patchEmptyNodeModule(emptyNodeModulePath),
];

if (patched.some(Boolean)) {
  console.log(
    `${LOG_PREFIX} patched ${path.relative(process.cwd(), devPlatformPath)}, ${path.relative(process.cwd(), walletHydratePath)}, and ${path.relative(process.cwd(), emptyNodeModulePath)}`,
  );
} else {
  console.log(`${LOG_PREFIX} package files already compatible.`);
}
