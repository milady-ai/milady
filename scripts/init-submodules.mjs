#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getElizaosPackageSpecifier,
  isLocalElizaDisabled,
} from "./lib/eliza-package-mode.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const root = resolve(__dirname, "..");
const skipLocalUpstreams = isLocalElizaDisabled();
const skipCloudSubmodule =
  process.env.MILADY_SKIP_CLOUD_SUBMODULE === "1" ||
  process.env.ELIZA_SKIP_CLOUD_SUBMODULE === "1";
const SUBMODULE_READINESS_MARKERS = {
  eliza: ["package.json", "packages/app-core/package.json"],
};

// Initialize nested eliza submodules in a second pass from inside eliza/ so
// per-submodule state (gitlink vs regular files) is evaluated correctly.
const NO_RECURSE_SUBMODULES = new Set(["eliza"]);

const LEGACY_ROOT_SUBMODULE_PATHS = ["cloud"];
const SKIPPED_CLOUD_WORKSPACE_ENTRIES = [
  { packageJson: "package.json", workspaces: ["eliza/cloud/packages/sdk"] },
  { packageJson: "eliza/package.json", workspaces: ["cloud/packages/sdk"] },
  {
    packageJson:
      "eliza/packages/app-core/deploy/cloud-agent-template/package.json",
    workspaces: [],
  },
];
const SKIPPED_CLOUD_COUPLED_SUBMODULE_PATHS = new Set([
  "plugins/plugin-elizacloud",
  "eliza/plugins/plugin-elizacloud",
]);
export function getSkippedCloudDependencyFallbacks(env = process.env) {
  return {
    "@elizaos/plugin-elizacloud": getElizaosPackageSpecifier(env),
  };
}
const LEGACY_ELIZA_PLUGIN_WORKSPACE_ENTRIES = [
  {
    canonicalEntry: "plugins/plugin-sql",
    legacyEntry: "plugins/plugin-sql/typescript",
  },
  {
    canonicalEntry: "plugins/plugin-ollama",
    legacyEntry: "plugins/plugin-ollama/typescript",
  },
  {
    canonicalEntry: "plugins/plugin-local-ai",
    legacyEntry: "plugins/plugin-local-ai/typescript",
  },
];
const PACKAGE_DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
];
const SKIPPED_CLOUD_LOCKFILES = ["bun.lock", "bun.lockb"];

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function readGitConfigValue(key, { cwd, exec = execSync } = {}) {
  try {
    return exec(`git config --file .gitmodules --get ${shellQuote(key)}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveGitDir(cwd, { exec = execSync } = {}) {
  const gitDir = exec("git rev-parse --git-dir", {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return resolve(cwd, gitDir);
}

export function hydrateSubmoduleFromConfiguredBranch(
  submodule,
  { rootDir = root, exec = execSync, remove = rmSync, log = console.log } = {},
) {
  const url = readGitConfigValue(`submodule.${submodule.name}.url`, {
    cwd: rootDir,
    exec,
  });
  if (!url) {
    throw new Error(`missing .gitmodules url for ${submodule.name}`);
  }

  const branch = readGitConfigValue(`submodule.${submodule.name}.branch`, {
    cwd: rootDir,
    exec,
  });
  const branchArg = branch ? ` --branch ${shellQuote(branch)}` : "";
  const submoduleRoot = resolve(rootDir, submodule.path);
  const modulesRoot = resolve(resolveGitDir(rootDir, { exec }), "modules");
  const submoduleGitDir = resolve(modulesRoot, submodule.path);

  log(
    `[init-submodules] Falling back to ${submodule.name} (${submodule.path}) from ${
      branch ? `branch ${branch}` : "the default branch"
    } because the recorded gitlink could not be fetched.`,
  );

  try {
    exec(`git submodule deinit -f -- ${shellQuote(submodule.path)}`, {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {}

  remove(submoduleRoot, { recursive: true, force: true });
  remove(submoduleGitDir, { recursive: true, force: true });

  exec(
    `git clone --depth=1${branchArg} ${shellQuote(url)} ${shellQuote(submodule.path)}`,
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
}

function getSubmoduleSkipReason(
  submodulePath,
  { skipLocal = skipLocalUpstreams, skipCloud = skipCloudSubmodule } = {},
) {
  if (skipLocal && submodulePath === "eliza") {
    return "local upstreams are disabled";
  }
  if (
    skipCloud &&
    (submodulePath === "cloud" || submodulePath === "eliza/cloud")
  ) {
    return "cloud submodule is disabled";
  }
  if (skipCloud && SKIPPED_CLOUD_COUPLED_SUBMODULE_PATHS.has(submodulePath)) {
    return "cloud-coupled plugin workspace is disabled";
  }
  return null;
}

export function shouldSkipSubmoduleInit(
  submodulePath,
  { skipLocal = skipLocalUpstreams, skipCloud = skipCloudSubmodule } = {},
) {
  return (
    getSubmoduleSkipReason(submodulePath, { skipLocal, skipCloud }) !== null
  );
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function getPackageWorkspaces(pkg) {
  if (isStringArray(pkg.workspaces)) {
    return pkg.workspaces;
  }
  if (
    pkg.workspaces &&
    typeof pkg.workspaces === "object" &&
    isStringArray(pkg.workspaces.packages)
  ) {
    return pkg.workspaces.packages;
  }
  return null;
}

function setPackageWorkspaces(pkg, workspaces) {
  if (Array.isArray(pkg.workspaces)) {
    pkg.workspaces = workspaces;
    return;
  }
  pkg.workspaces.packages = workspaces;
}

function rewriteSkippedCloudDependencies(pkg, { env = process.env } = {}) {
  let changed = false;
  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }
    for (const [name, version] of Object.entries(
      getSkippedCloudDependencyFallbacks(env),
    )) {
      if (deps[name] === "workspace:*") {
        deps[name] = version;
        changed = true;
      }
    }
  }
  return changed;
}

export function pruneSkippedCloudWorkspace({
  rootDir = root,
  exists = existsSync,
  readFile = readFileSync,
  writeFile = writeFileSync,
  remove = rmSync,
  log = console.log,
  skipCloud = skipCloudSubmodule,
} = {}) {
  if (!skipCloud) {
    return [];
  }

  if (exists(resolve(rootDir, "eliza/cloud/packages/sdk/package.json"))) {
    return [];
  }

  const changed = [];
  for (const entry of SKIPPED_CLOUD_WORKSPACE_ENTRIES) {
    const packageJsonPath = resolve(rootDir, entry.packageJson);
    if (!exists(packageJsonPath)) {
      continue;
    }

    const raw = readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    const workspaces = getPackageWorkspaces(pkg);
    let packageChanged = false;

    if (workspaces) {
      const nextWorkspaces = workspaces.filter(
        (workspaceEntry) => !entry.workspaces.includes(workspaceEntry),
      );
      if (nextWorkspaces.length !== workspaces.length) {
        setPackageWorkspaces(pkg, nextWorkspaces);
        packageChanged = true;
      }
    }

    if (rewriteSkippedCloudDependencies(pkg)) {
      packageChanged = true;
    }

    if (!packageChanged) {
      continue;
    }

    const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
    writeFile(packageJsonPath, `${JSON.stringify(pkg, null, indent)}\n`);
    changed.push(entry.packageJson);
    log(
      `[init-submodules] Applied skipped cloud workspace fallbacks to ${entry.packageJson}`,
    );
  }

  if (changed.length > 0) {
    for (const lockfile of SKIPPED_CLOUD_LOCKFILES) {
      const lockfilePath = resolve(rootDir, lockfile);
      if (!exists(lockfilePath)) {
        continue;
      }
      remove(lockfilePath, { force: true });
      log(
        `[init-submodules] Removed ${lockfile} so Bun regenerates without skipped cloud workspaces`,
      );
    }
  }

  return changed;
}

export function pruneDuplicateLegacyElizaPluginWorkspaces({
  rootDir = root,
  exists = existsSync,
  readFile = readFileSync,
  writeFile = writeFileSync,
  log = console.log,
} = {}) {
  const packageJsonPath = resolve(rootDir, "eliza", "package.json");
  if (!exists(packageJsonPath)) {
    return [];
  }

  const raw = readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  const workspaces = getPackageWorkspaces(pkg);
  if (!workspaces) {
    return [];
  }

  const duplicateLegacyEntries = LEGACY_ELIZA_PLUGIN_WORKSPACE_ENTRIES.filter(
    ({ canonicalEntry, legacyEntry }) => {
      return (
        workspaces.includes(legacyEntry) &&
        exists(resolve(rootDir, "eliza", canonicalEntry, "package.json")) &&
        exists(resolve(rootDir, "eliza", legacyEntry, "package.json"))
      );
    },
  ).map(({ legacyEntry }) => legacyEntry);

  if (duplicateLegacyEntries.length === 0) {
    return [];
  }

  setPackageWorkspaces(
    pkg,
    workspaces.filter(
      (workspaceEntry) => !duplicateLegacyEntries.includes(workspaceEntry),
    ),
  );
  const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
  writeFile(packageJsonPath, `${JSON.stringify(pkg, null, indent)}\n`);
  log(
    `[init-submodules] Removed duplicate legacy eliza plugin workspace entries (${duplicateLegacyEntries.join(", ")})`,
  );

  return duplicateLegacyEntries;
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

export function pruneLegacyRootSubmodulesMovedUnderEliza(
  rootDir,
  { exec = execSync, log = console.log, logError = console.error } = {},
) {
  const tracked = new Set(
    loadTrackedSubmodules({ exec, cwd: rootDir }).map((s) => s.path),
  );

  for (const rel of LEGACY_ROOT_SUBMODULE_PATHS) {
    if (tracked.has(rel)) {
      continue;
    }

    let mode = "";
    try {
      const line = exec(`git ls-files -s -- "${rel}"`, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!line) {
        continue;
      }
      mode = line.split(/\s+/)[0] ?? "";
    } catch {
      continue;
    }

    if (mode !== "160000") {
      continue;
    }

    log(
      `[init-submodules] Removing stale top-level submodule "${rel}" (now under eliza/). Deinitializing…`,
    );
    try {
      exec(`git submodule deinit -f -- "${rel}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch {}
    try {
      exec(`git rm -f -- "${rel}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch (err) {
      logError(
        `[init-submodules] Could not drop stale submodule "${rel}" from the index: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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

export function isTrackedAsGitlink(
  submodulePath,
  { exec = execSync, cwd = root } = {},
) {
  try {
    const output = exec(`git ls-files -s -- "${submodulePath}"`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!output) {
      return false;
    }

    const lines = output.split("\n").filter(Boolean);
    if (lines.length !== 1) {
      return false;
    }

    const [mode, , , trackedPath] = lines[0].split(/\s+/, 4);
    return mode === "160000" && trackedPath === submodulePath;
  } catch {
    return false;
  }
}

function emptySubmoduleInitResult(submodules = []) {
  return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules };
}

function syncSubmoduleUrls(rootDir, { exec, logError }) {
  try {
    exec("git submodule sync --recursive", {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch (err) {
    logError(
      `[init-submodules] git submodule sync --recursive failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function readSubmoduleStatus(submodulePath, { cwd, exec }) {
  try {
    return exec(`git submodule status -- "${submodulePath}"`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function hasDirtySubmoduleCheckout(submodulePath, { cwd, exec, log, label }) {
  try {
    const checkoutRoot = resolve(cwd, submodulePath);
    const dirty = exec("git status --porcelain", {
      cwd: checkoutRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!dirty) {
      return false;
    }
    log(`[init-submodules] ⚠ ${label} has uncommitted local changes`);
    return true;
  } catch {
    return false;
  }
}

function resolveRootSubmoduleInitPlan(
  submodule,
  { rootDir, exists, exec, log },
) {
  const checkoutReady = isSubmoduleCheckoutReady(submodule.path, {
    rootDir,
    exists,
  });
  let needsInit = !checkoutReady;
  let initReason = checkoutReady ? "" : "checkout is incomplete";
  let hasUncommittedChanges = false;
  const status = readSubmoduleStatus(submodule.path, { cwd: rootDir, exec });

  if (status === null) {
    return {
      needsInit: true,
      initReason: initReason || "status check failed",
      hasUncommittedChanges,
    };
  }

  if (status.startsWith("-")) {
    needsInit = true;
    initReason = "submodule is not initialized";
  } else if (status.startsWith("+")) {
    needsInit = true;
    initReason = "checkout is not at the parent repo's recorded commit";
    log(
      `[init-submodules] ${submodule.name} (${submodule.path}) is not at the parent repo's recorded commit`,
    );
  } else {
    hasUncommittedChanges = hasDirtySubmoduleCheckout(submodule.path, {
      cwd: rootDir,
      exec,
      log,
      label: `${submodule.name} (${submodule.path})`,
    });
  }

  return { needsInit, initReason, hasUncommittedChanges };
}

function initializeRootSubmoduleCheckout(
  submodule,
  { rootDir, exists, exec, log },
) {
  const recurseFlag = NO_RECURSE_SUBMODULES.has(submodule.path)
    ? ""
    : " --recursive";
  try {
    exec(`git submodule sync -- "${submodule.path}"`, {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {}
  try {
    exec(`git submodule update --init${recurseFlag} "${submodule.path}"`, {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {
    log(
      `[init-submodules] Shallow init failed for ${submodule.name}, retrying with full fetch...`,
    );
    initializeRootSubmoduleFromFullFetch(submodule, {
      rootDir,
      exists,
      exec,
      log,
      recurseFlag,
    });
  }
  if (!isSubmoduleCheckoutReady(submodule.path, { rootDir, exists })) {
    throw new Error(
      `submodule checkout is still incomplete after update: ${submodule.path}`,
    );
  }
}

function initializeRootSubmoduleFromFullFetch(
  submodule,
  { rootDir, exists, exec, log, recurseFlag },
) {
  try {
    try {
      exec(`git submodule init "${submodule.path}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
    } catch {}
    const smRoot = resolve(rootDir, submodule.path);
    if (exists(smRoot) && exists(resolve(smRoot, ".git"))) {
      exec("git fetch --unshallow || git fetch --all", {
        cwd: smRoot,
        stdio: "inherit",
        shell: true,
      });
    }
    exec(`git submodule update${recurseFlag} "${submodule.path}"`, {
      cwd: rootDir,
      stdio: "inherit",
    });
  } catch {
    hydrateSubmoduleFromConfiguredBranch(submodule, {
      rootDir,
      exec,
      remove: rmSync,
      log,
    });
  }
}

function processRootSubmodule(
  submodule,
  { rootDir, exists, exec, log, logError, shouldSkipSubmodule },
) {
  const skipReason = getSubmoduleSkipReason(submodule.path);
  if (shouldSkipSubmodule(submodule.path)) {
    log(
      `[init-submodules] Skipping ${submodule.name} (${submodule.path}) because ${skipReason ?? "local upstreams are disabled"}`,
    );
    return "skipped";
  }

  if (!isTrackedAsGitlink(submodule.path, { exec, cwd: rootDir })) {
    log(
      `[init-submodules] Skipping ${submodule.name} (${submodule.path}) because the parent repo tracks that path as regular files, not a gitlink`,
    );
    return "skipped";
  }

  const plan = resolveRootSubmoduleInitPlan(submodule, {
    rootDir,
    exists,
    exec,
    log,
  });
  if (plan.needsInit && plan.hasUncommittedChanges) {
    logError(
      `[init-submodules] Refusing to update ${submodule.name} (${submodule.path}) because it has uncommitted local changes`,
    );
    return "failed";
  }
  if (!plan.needsInit) {
    return "alreadyInitialized";
  }

  log(
    `[init-submodules] Initializing ${submodule.name} (${submodule.path})${
      plan.initReason ? ` because ${plan.initReason}` : ""
    }...`,
  );
  try {
    initializeRootSubmoduleCheckout(submodule, { rootDir, exists, exec, log });
    log(`[init-submodules] ${submodule.name} initialized successfully`);
    return "initialized";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(
      `[init-submodules] Failed to initialize ${submodule.name} (${submodule.path}): ${message}`,
    );
    return "failed";
  }
}

function processRootSubmodules(submodules, options) {
  const summary = { initialized: 0, alreadyInitialized: 0, failed: 0 };
  for (const submodule of submodules) {
    const result = processRootSubmodule(submodule, options);
    if (result in summary) {
      summary[result]++;
    }
  }
  return summary;
}

function resolveNestedSubmoduleInitPlan(
  nestedSubmodule,
  rootRelativePath,
  { elizaRoot, exec, log },
) {
  let needsInit = true;
  let initReason = "status check failed";
  let hasUncommittedChanges = false;
  const status = readSubmoduleStatus(nestedSubmodule.path, {
    cwd: elizaRoot,
    exec,
  });

  if (status === null) {
    return { needsInit, initReason, hasUncommittedChanges };
  }

  if (status.startsWith("-")) {
    initReason = "submodule is not initialized";
  } else if (status.startsWith("+")) {
    initReason = "checkout is not at eliza's recorded commit";
  } else {
    needsInit = false;
    initReason = "";
  }

  if (!status.startsWith("-")) {
    hasUncommittedChanges = hasDirtySubmoduleCheckout(nestedSubmodule.path, {
      cwd: elizaRoot,
      exec,
      log,
      label: `nested ${nestedSubmodule.name} (${rootRelativePath})`,
    });
  }

  return { needsInit, initReason, hasUncommittedChanges };
}

function updateNestedSubmodule(nestedSubmodule, rootRelativePath, options) {
  const { elizaRoot, exec, log, logError } = options;
  try {
    exec(
      `git submodule update --init --recursive -- "${nestedSubmodule.path}"`,
      {
        cwd: elizaRoot,
        stdio: "inherit",
      },
    );
    return true;
  } catch (err) {
    try {
      hydrateSubmoduleFromConfiguredBranch(nestedSubmodule, {
        rootDir: elizaRoot,
        exec,
        remove: rmSync,
        log,
      });
      return true;
    } catch (fallbackErr) {
      logError(
        `[init-submodules] Failed to initialize nested ${nestedSubmodule.name} (${rootRelativePath}): ${
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr)
        }`,
      );
      logError(
        `[init-submodules] Original nested submodule error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }
}

function processNestedSubmodule(nestedSubmodule, options) {
  const { elizaRoot, exec, log, logError } = options;
  const rootRelativePath = `eliza/${nestedSubmodule.path}`;
  const skipReason = getSubmoduleSkipReason(rootRelativePath, {
    skipLocal: false,
  });
  if (skipReason) {
    log(
      `[init-submodules] Skipping nested ${nestedSubmodule.name} (${rootRelativePath}) because ${skipReason}`,
    );
    return "skipped";
  }
  if (!isTrackedAsGitlink(nestedSubmodule.path, { exec, cwd: elizaRoot })) {
    return "skipped";
  }

  const plan = resolveNestedSubmoduleInitPlan(
    nestedSubmodule,
    rootRelativePath,
    {
      elizaRoot,
      exec,
      log,
    },
  );
  if (!plan.needsInit) {
    return "skipped";
  }
  if (plan.hasUncommittedChanges) {
    logError(
      `[init-submodules] Refusing to update nested ${nestedSubmodule.name} (${rootRelativePath}) because it has uncommitted local changes`,
    );
    return "failed";
  }

  log(
    `[init-submodules] Updating nested ${nestedSubmodule.name} (${rootRelativePath})${
      plan.initReason ? ` because ${plan.initReason}` : ""
    }...`,
  );
  return updateNestedSubmodule(nestedSubmodule, rootRelativePath, options)
    ? "updated"
    : "failed";
}

function ensureNestedElizaSubmodules({
  rootDir,
  exists,
  exec,
  log,
  logError,
  shouldSkipSubmodule,
}) {
  if (
    shouldSkipSubmodule("eliza") ||
    !exists(resolve(rootDir, "eliza", ".gitmodules"))
  ) {
    return 0;
  }

  const elizaRoot = resolve(rootDir, "eliza");
  log(
    "[init-submodules] Ensuring nested checkouts under eliza/ (cloud, plugins, …)…",
  );
  try {
    exec("git submodule sync --recursive", {
      cwd: elizaRoot,
      stdio: "inherit",
    });

    let failed = 0;
    for (const nestedSubmodule of loadTrackedSubmodules({
      exec,
      cwd: elizaRoot,
    })) {
      if (
        processNestedSubmodule(nestedSubmodule, {
          elizaRoot,
          exec,
          log,
          logError,
        }) === "failed"
      ) {
        failed++;
      }
    }
    return failed;
  } catch (err) {
    logError(
      `[init-submodules] Unexpected error initializing nested eliza submodules: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 0;
  }
}

function logInitSubmodulesSummary(
  { initialized, alreadyInitialized, failed },
  { log, logError },
) {
  if (failed > 0) {
    logError(
      `[init-submodules] Initialized ${initialized}, already ready ${alreadyInitialized}, failed ${failed}.`,
    );
    return;
  }
  if (initialized === 0) {
    log("[init-submodules] All submodules already initialized");
    return;
  }
  log(
    `[init-submodules] Initialized ${initialized} submodule(s); ${alreadyInitialized} already ready.`,
  );
}

export function runInitSubmodules({
  rootDir = root,
  exists = existsSync,
  exec = execSync,
  log = console.log,
  logError = console.error,
  shouldSkipSubmodule = shouldSkipSubmoduleInit,
} = {}) {
  const gitDir = resolve(rootDir, ".git");
  if (!exists(gitDir)) {
    log("[init-submodules] Not a git repository — skipping");
    return emptySubmoduleInitResult();
  }

  const gitmodulesPath = resolve(rootDir, ".gitmodules");
  if (!exists(gitmodulesPath)) {
    log("[init-submodules] No .gitmodules found — skipping");
    return emptySubmoduleInitResult();
  }

  const submodules = loadTrackedSubmodules({ exec, cwd: rootDir });
  if (submodules.length === 0) {
    log("[init-submodules] No tracked submodules found — skipping");
    return emptySubmoduleInitResult();
  }

  const hasLegacyRootCloudPaths = submodules.some((s) => s.path === "cloud");
  if (hasLegacyRootCloudPaths) {
    log(
      "[init-submodules] This .gitmodules still lists cloud/ at the repo root. Pull the latest branch where it is nested under eliza/, or edit .gitmodules to match.",
    );
  }

  pruneLegacyRootSubmodulesMovedUnderEliza(rootDir, {
    exec,
    log,
    logError,
    exists,
  });

  syncSubmoduleUrls(rootDir, { exec, logError });

  const summary = processRootSubmodules(submodules, {
    rootDir,
    exists,
    exec,
    log,
    logError,
    shouldSkipSubmodule,
  });
  summary.failed += ensureNestedElizaSubmodules({
    rootDir,
    exists,
    exec,
    log,
    logError,
    shouldSkipSubmodule,
  });

  logInitSubmodulesSummary(summary, { log, logError });

  logInitSubmodulesSummary({ ...result, log, logError });
  pruneSkippedCloudWorkspace({
    rootDir,
    exists,
    log,
  });
  pruneDuplicateLegacyElizaPluginWorkspaces({
    rootDir,
    exists,
    log,
  });

  return { ...summary, submodules };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile);

if (isDirectRun) {
  const result = runInitSubmodules();
  if (process.env.CI === "true" && result.failed > 0) {
    process.exit(1);
  }
}
