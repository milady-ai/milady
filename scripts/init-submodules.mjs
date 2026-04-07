#!/usr/bin/env node
/**
 * Post-install script to initialize git submodules if they haven't been.
 * This ensures tracked submodules from .gitmodules are initialized when
 * cloning the repo or installing dependencies.
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/init-submodules.mjs
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const root = resolve(__dirname, "..");
const skipLocalUpstreams =
  process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
  process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1";
const SUBMODULE_READINESS_MARKERS = {
  eliza: ["package.json", "packages/typescript/package.json"],
  "plugins/plugin-agent-orchestrator": ["package.json"],
  "steward-fi": ["package.json", "packages/api/package.json"],
};

// plugin-openrouter contains PGlite :memory:<UUID> paths committed under
// typescript/ that Windows git rejects as invalid filenames. Skip checkout
// until elizaos-plugins/plugin-openrouter#25 is merged; the package is
// available via npm in the meantime.
// TODO: remove once elizaos-plugins/plugin-openrouter#25 is merged.
const SKIP_SUBMODULES = new Set(["plugins/plugin-openrouter"]);

function getSubmoduleSkipReason(
  submodulePath,
  { skipLocal = skipLocalUpstreams } = {},
) {
  if (SKIP_SUBMODULES.has(submodulePath)) {
    return "it is in the explicit skip list";
  }
  if (skipLocal && submodulePath === "eliza") {
    return "local upstreams are disabled";
  }
  return null;
}

export function shouldSkipSubmoduleInit(
  submodulePath,
  { skipLocal = skipLocalUpstreams } = {},
) {
  return getSubmoduleSkipReason(submodulePath, { skipLocal }) !== null;
}

export function parseTrackedSubmodules(configOutput) {
  if (!configOutput.trim()) return [];

  return configOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKey, path] = line.split(/\s+/, 2);
      const name = rawKey.replace(/^submodule\./, "").replace(/\.path$/, "");
      return { name, path };
    });
}

export function loadTrackedSubmodules({ exec = execSync, cwd = root } = {}) {
  try {
    const output = exec(
      'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"',
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return parseTrackedSubmodules(output);
  } catch {
    return [];
  }
}

export function getSubmoduleReadinessMarkerPaths(
  submodulePath,
  { rootDir = root } = {},
) {
  const markers = SUBMODULE_READINESS_MARKERS[submodulePath] ?? [];
  return markers.map((marker) => resolve(rootDir, submodulePath, marker));
}

export function isSubmoduleCheckoutReady(
  submodulePath,
  { rootDir = root, exists = existsSync } = {},
) {
  const markerPaths = getSubmoduleReadinessMarkerPaths(submodulePath, {
    rootDir,
  });

  if (markerPaths.length === 0) {
    return true;
  }

  return markerPaths.every((markerPath) => exists(markerPath));
}

export function runInitSubmodules({
  rootDir = root,
  exists = existsSync,
  exec = execSync,
  log = console.log,
  logError = console.error,
  shouldSkipSubmodule = shouldSkipSubmoduleInit,
} = {}) {
  // Check if we're in a git repository
  const gitDir = resolve(rootDir, ".git");
  if (!exists(gitDir)) {
    log("[init-submodules] Not a git repository — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  const gitmodulesPath = resolve(rootDir, ".gitmodules");
  if (!exists(gitmodulesPath)) {
    log("[init-submodules] No .gitmodules found — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  const submodules = loadTrackedSubmodules({ exec, cwd: rootDir });
  if (submodules.length === 0) {
    log("[init-submodules] No tracked submodules found — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  let initialized = 0;
  let alreadyInitialized = 0;
  let failed = 0;

  for (const submodule of submodules) {
    const skipReason = getSubmoduleSkipReason(submodule.path);
    if (shouldSkipSubmodule(submodule.path)) {
      log(
        `[init-submodules] Skipping ${submodule.name} (${submodule.path}) because ${skipReason ?? "local upstreams are disabled"}`,
      );
      continue;
    }

    const checkoutReady = isSubmoduleCheckoutReady(submodule.path, {
      rootDir,
      exists,
    });
    let needsInit = !checkoutReady;
    let initReason = checkoutReady ? "" : "checkout is incomplete";

    try {
      const status = exec(`git submodule status -- "${submodule.path}"`, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (status.startsWith("-")) {
        needsInit = true;
        initReason = "submodule is not initialized";
      }
    } catch {
      // If status lookup fails, attempt initialization directly.
      needsInit = true;
      if (!initReason) {
        initReason = "status check failed";
      }
    }

    if (!needsInit) {
      alreadyInitialized++;
      continue;
    }

    log(
      `[init-submodules] Initializing ${submodule.name} (${submodule.path})${
        initReason ? ` because ${initReason}` : ""
      }...`,
    );
    try {
      exec(`git submodule update --init --recursive "${submodule.path}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
      if (
        !isSubmoduleCheckoutReady(submodule.path, {
          rootDir,
          exists,
        })
      ) {
        throw new Error(
          `submodule checkout is still incomplete after update: ${submodule.path}`,
        );
      }
      initialized++;
      log(`[init-submodules] ${submodule.name} initialized successfully`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logError(
        `[init-submodules] Failed to initialize ${submodule.name} (${submodule.path}): ${message}`,
      );
    }
  }

  if (failed > 0) {
    logError(
      `[init-submodules] Initialized ${initialized}, already ready ${alreadyInitialized}, failed ${failed}.`,
    );
  } else if (initialized === 0) {
    log("[init-submodules] All submodules already initialized");
  } else {
    log(
      `[init-submodules] Initialized ${initialized} submodule(s); ${alreadyInitialized} already ready.`,
    );
  }

  return { initialized, alreadyInitialized, failed, submodules };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile);

if (isDirectRun) {
  runInitSubmodules();
}
