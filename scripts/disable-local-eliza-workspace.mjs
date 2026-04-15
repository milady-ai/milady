#!/usr/bin/env node

/**
 * Disable the repo-local `eliza/` workspace for CI runs that have
 * `MILADY_SKIP_LOCAL_UPSTREAMS=1` set (Docker CI Smoke, Release
 * Workflow Contract, packaged build jobs, etc.).
 *
 * Three things have to happen for Bun to produce a clean lockfile when
 * `eliza/` is absent:
 *
 *   1. The `eliza/` directory must not exist on disk. The submodule
 *      init step already skips it in SKIP_LOCAL_UPSTREAMS mode, but if
 *      a fresh checkout DID materialize it (e.g. local repro) we also
 *      rename it out of the way here.
 *
 *   2. The root `package.json` `workspaces` array must not contain
 *      `"eliza/packages/*"`. Leaving that glob in place while the
 *      directory is absent causes Bun 1.3.x to emit a bun.lock that
 *      carries both a workspace entry AND an npm-resolved entry for
 *      `@elizaos/core`.
 *
 *   3. Every workspace package.json that still pins
 *      `"@elizaos/core": "workspace:*"` must be rewritten to the same
 *      registry version that the root `overrides` block and
 *      `eliza/packages/app-core/deploy/cloud-agent-template` already use
 *      (`@elizaos/core@2.0.0-alpha.115` at time of writing). Without
 *      this rewrite, Bun hoists a registry-resolved `@elizaos/core`
 *      for the workspace:* callers AND a separate registry-resolved
 *      `@elizaos/core` for cloud-agent-template, emitting two
 *      top-level `"@elizaos/core"` entries in bun.lock's packages
 *      section. The next `bun pm pack --dry-run` (invoked from
 *      `scripts/release-check.ts`) then fails with:
 *
 *        error: Duplicate package path
 *            at bun.lock:XXXX:5
 *        error: failed to parse lockfile: InvalidPackageKey
 *
 *      blocking the Release Workflow Contract job.
 *
 * We patch every affected file in place (no commit, CI-only). All
 * edits are idempotent and gated on `GITHUB_ACTIONS=true` +
 * `MILADY_SKIP_LOCAL_UPSTREAMS=1`, so local runs and non-skip CI are
 * untouched.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ELIZA_WORKSPACE_GLOB = "eliza/packages/*";
export const PLUGIN_ROOT_WORKSPACE_GLOB = "eliza/plugins/*";
export const PLUGIN_TYPESCRIPT_WORKSPACE_GLOB =
  "eliza/plugins/plugin-*/typescript";
export const DISABLED_WORKSPACE_GLOBS = [
  ELIZA_WORKSPACE_GLOB,
  PLUGIN_ROOT_WORKSPACE_GLOB,
  PLUGIN_TYPESCRIPT_WORKSPACE_GLOB,
];
export const LOCAL_ONLY_WORKSPACE_GLOBS = [
  "eliza/packages/native-plugins/*",
  "eliza/apps/*",
];
export const LOCAL_ONLY_WORKSPACE_PATHS = ["eliza/packages/shared"];
export const NESTED_INSTALLABLE_PACKAGE_GLOBS = [
  // These package.json files are installed directly by CI/build scripts even
  // though they do not participate in the root workspace graph.
  "eliza/packages/app-core/platforms/*",
];
export const CI_OVERRIDE_SPECIFIERS = {
  "@elizaos/plugin-wechat": "file:./scripts/ci-stubs/elizaos-plugin-wechat",
};
export const ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS = {
  "@elizaos/plugin-wechat": "file:../scripts/ci-stubs/elizaos-plugin-wechat",
  "@elizaos/ui": "file:./packages/ui",
};
export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
export const CI_LOCKFILES = ["bun.lock", "bun.lockb"];
export const PINNED_VERSION_SOURCE_OVERRIDE = "override";
export const PINNED_VERSION_SOURCE_TEMPLATE = "template";
export const PINNED_VERSION_SOURCE_WORKSPACE = "workspace";

const ELIZAOS_CORE_NAME = "@elizaos/core";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = process.cwd();

export function resolveRootUiOverrideSpecifier(repoRoot = DEFAULT_REPO_ROOT) {
  const disabledUiPackageJsonPath = path.join(
    repoRoot,
    ".eliza.ci-disabled",
    "packages",
    "ui",
    "package.json",
  );

  if (fs.existsSync(disabledUiPackageJsonPath)) {
    return "file:./.eliza.ci-disabled/packages/ui";
  }

  return "file:./eliza/packages/ui";
}

export function resolveCiOverrideSpecifiers(repoRoot = DEFAULT_REPO_ROOT) {
  return {
    ...CI_OVERRIDE_SPECIFIERS,
    "@elizaos/ui": resolveRootUiOverrideSpecifier(repoRoot),
  };
}

/**
 * @typedef {import("./lib/package-types.d.ts").PackageJsonRecord} PackageJsonRecord
 */

/**
 * @typedef {object} RegistryPackageInfo
 * @property {string[] | string=} versions
 * @property {{ alpha?: string, latest?: string }=} dist-tags
 * @property {string=} version
 */

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(rawValue) {
  try {
    const parsed = JSON.parse(rawValue);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isStringRecord(value) {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isWorkspacesValue(value) {
  return (
    isStringArray(value) ||
    (isRecord(value) &&
      (value.packages === undefined || isStringArray(value.packages)))
  );
}

/**
 * @param {unknown} value
 * @returns {value is PackageJsonRecord}
 */
function isPackageJsonRecord(value) {
  return (
    isRecord(value) &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.version === undefined || typeof value.version === "string") &&
    (value.dependencies === undefined || isStringRecord(value.dependencies)) &&
    (value.devDependencies === undefined ||
      isStringRecord(value.devDependencies)) &&
    (value.peerDependencies === undefined ||
      isStringRecord(value.peerDependencies)) &&
    (value.optionalDependencies === undefined ||
      isStringRecord(value.optionalDependencies)) &&
    (value.overrides === undefined || isStringRecord(value.overrides)) &&
    (value.scripts === undefined || isStringRecord(value.scripts)) &&
    (value.patchedDependencies === undefined ||
      isStringRecord(value.patchedDependencies)) &&
    (value.bundleDependencies === undefined ||
      value.bundleDependencies === false ||
      value.bundleDependencies === true ||
      isStringArray(value.bundleDependencies)) &&
    (value.workspaces === undefined || isWorkspacesValue(value.workspaces))
  );
}

function isDistTags(value) {
  return (
    isRecord(value) &&
    (value.alpha === undefined || typeof value.alpha === "string") &&
    (value.latest === undefined || typeof value.latest === "string")
  );
}

function isRegistryPackageInfo(value) {
  return (
    isRecord(value) &&
    (value.versions === undefined ||
      typeof value.versions === "string" ||
      isStringArray(value.versions)) &&
    (value["dist-tags"] === undefined || isDistTags(value["dist-tags"])) &&
    (value.version === undefined || typeof value.version === "string")
  );
}

/**
 * Remove stale lockfiles so Bun regenerates against the rewritten workspace graph.
 * Returns the list of lockfile names that were actually removed.
 */
function removeStaleLockfiles(
  repoRoot,
  { lockfileNames = CI_LOCKFILES, log = console.log } = {},
) {
  const removed = [];
  for (const lockfileName of lockfileNames) {
    const lockfilePath = path.join(repoRoot, lockfileName);
    if (!fs.existsSync(lockfilePath)) continue;
    fs.rmSync(lockfilePath, { force: true });
    removed.push(lockfileName);
  }
  if (removed.length > 0) {
    log(
      `[disable-local-eliza-workspace] Removed ${removed.join(", ")} so Bun regenerates the lockfile against the rewritten workspace graph`,
    );
  }
  return removed;
}

function isExactRegistryVersion(specifier) {
  return typeof specifier === "string" && /^\d+\.\d+\.\d+/.test(specifier);
}

export function isWorkspaceProtocolSpecifier(specifier) {
  return typeof specifier === "string" && specifier.startsWith("workspace:");
}

/**
 * @param {string} filePath
 * @returns {PackageJsonRecord | null}
 */
export function readPackageJson(filePath) {
  const parsed = parseJsonObject(fs.readFileSync(filePath, "utf8"));
  return isPackageJsonRecord(parsed) ? parsed : null;
}

/**
 * @param {string | null | undefined} rawValue
 * @returns {RegistryPackageInfo | null}
 */
export function parseRegistryPackageInfo(rawValue) {
  if (!rawValue) {
    return null;
  }

  const parsed = parseJsonObject(rawValue);
  return isRegistryPackageInfo(parsed) ? parsed : null;
}

export function readRegistryPackageInfo(
  packageName,
  { execSyncImpl = execSync } = {},
) {
  const rawValue = execSyncImpl(
    `npm view "${packageName}" versions dist-tags version --json`,
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return parseRegistryPackageInfo(rawValue);
}

/**
 * @param {string} preferredVersion
 * @param {RegistryPackageInfo | null} registryInfo
 * @returns {string}
 */
export function selectPublishedRegistryVersion(preferredVersion, registryInfo) {
  if (!isExactRegistryVersion(preferredVersion)) {
    return preferredVersion;
  }

  const availableVersions = new Set(
    Array.isArray(registryInfo?.versions)
      ? registryInfo.versions.filter((value) => typeof value === "string")
      : typeof registryInfo?.versions === "string"
        ? [registryInfo.versions]
        : [],
  );
  if (availableVersions.has(preferredVersion)) {
    return preferredVersion;
  }

  const alphaTag = registryInfo?.["dist-tags"]?.alpha;
  if (isExactRegistryVersion(alphaTag)) {
    return alphaTag;
  }

  const latestTag = registryInfo?.["dist-tags"]?.latest;
  if (isExactRegistryVersion(latestTag)) {
    return latestTag;
  }

  if (isExactRegistryVersion(registryInfo?.version)) {
    return registryInfo.version;
  }

  return preferredVersion;
}

/**
 * @param {string} rootDir
 * @param {{
 *   rootPackage?: PackageJsonRecord | null;
 *   readJson?: (filePath: string) => PackageJsonRecord | null;
 *   versionSources?: Map<string, string>;
 * }} [options]
 * @returns {string | null}
 */
export function resolvePinnedCoreVersion(
  rootDir,
  { rootPackage, readJson = readPackageJson, versionSources = undefined } = {},
) {
  const fromOverrides = rootPackage?.overrides?.[ELIZAOS_CORE_NAME];
  if (isExactRegistryVersion(fromOverrides)) {
    versionSources?.set(ELIZAOS_CORE_NAME, PINNED_VERSION_SOURCE_OVERRIDE);
    return fromOverrides;
  }

  const templatePath = path.join(
    rootDir,
    "eliza",
    "packages",
    "app-core",
    "deploy",
    "cloud-agent-template",
    "package.json",
  );
  const disabledTemplatePath = path.join(
    rootDir,
    ".eliza.ci-disabled",
    "packages",
    "app-core",
    "deploy",
    "cloud-agent-template",
    "package.json",
  );
  for (const candidatePath of [templatePath, disabledTemplatePath]) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }
    try {
      const templatePkg = readJson(candidatePath);
      const fromTemplate = templatePkg?.dependencies?.[ELIZAOS_CORE_NAME];
      if (isExactRegistryVersion(fromTemplate)) {
        versionSources?.set(ELIZAOS_CORE_NAME, PINNED_VERSION_SOURCE_TEMPLATE);
        return fromTemplate;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

// Persist root package.json mutations before touching sub-packages so
// the workspaces patch is written even if the core-rewrite step bails.
/**
 * @param {string} filePath
 * @param {string} originalRaw
 * @param {PackageJsonRecord} pkg
 * @returns {boolean}
 */
export function writePackageJson(filePath, originalRaw, pkg) {
  const hasTrailingNewline = originalRaw.endsWith("\n");
  const serialized =
    JSON.stringify(pkg, null, 2) + (hasTrailingNewline ? "\n" : "");
  if (serialized === originalRaw) {
    return false;
  }
  fs.writeFileSync(filePath, serialized);
  return true;
}

export function expandGlob(glob, { rootDir = DEFAULT_REPO_ROOT } = {}) {
  if (!glob.includes("*")) {
    return [glob];
  }
  const parts = glob.split("/");
  const starIndex = parts.findIndex((segment) => segment.includes("*"));
  if (starIndex === -1) {
    return [glob];
  }
  const baseSegments = parts.slice(0, starIndex);
  const base = baseSegments.length
    ? path.join(rootDir, ...baseSegments)
    : rootDir;
  if (!fs.existsSync(base)) {
    return [];
  }

  const segmentPattern = parts[starIndex];
  const tail = parts.slice(starIndex + 1);

  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const regex = new RegExp(
    "^" +
      segmentPattern
        .split("*")
        .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  );

  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!regex.test(entry.name)) continue;
    const relativePath = path.join(...baseSegments, entry.name);
    matches.push(tail.length ? path.join(relativePath, ...tail) : relativePath);
  }

  if (tail.length === 0) {
    return matches;
  }

  return matches.filter((match) => fs.existsSync(path.join(rootDir, match)));
}

/**
 * @param {string} rootDir
 * @param {{
 *   disabledWorkspaceGlobs?: string[];
 *   rootPackage?: PackageJsonRecord | null;
 *   versionSources?: Map<string, string>;
 *   pinnedCore?: string | null;
 * }} [options]
 * @returns {Map<string, string>}
 */
export function resolvePinnedWorkspaceVersions(
  rootDir,
  {
    disabledWorkspaceGlobs = DISABLED_WORKSPACE_GLOBS,
    rootPackage = undefined,
    versionSources = undefined,
    pinnedCore = resolvePinnedCoreVersion(rootDir, {
      rootPackage,
      versionSources,
    }),
  } = {},
) {
  const pinnedVersions = new Map();

  if (isExactRegistryVersion(pinnedCore)) {
    pinnedVersions.set(ELIZAOS_CORE_NAME, pinnedCore);
  }

  for (const [dependencyName, specifier] of Object.entries(
    rootPackage?.overrides ?? {},
  )) {
    if (isExactRegistryVersion(specifier)) {
      pinnedVersions.set(dependencyName, specifier);
      versionSources?.set(dependencyName, PINNED_VERSION_SOURCE_OVERRIDE);
    }
  }

  for (const workspaceGlob of disabledWorkspaceGlobs) {
    for (const workspaceRel of expandGlob(workspaceGlob, { rootDir })) {
      const pkgPath = path.join(rootDir, workspaceRel, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = readPackageJson(pkgPath);
        if (!pkg) {
          continue;
        }
        if (
          typeof pkg.name === "string" &&
          isExactRegistryVersion(pkg.version)
        ) {
          pinnedVersions.set(pkg.name, pkg.version);
          versionSources?.set(pkg.name, PINNED_VERSION_SOURCE_WORKSPACE);
        }
      } catch {
        // Ignore malformed/partial plugin checkouts and continue.
      }
    }
  }

  // Collect names of packages from workspace paths known to be local-only
  // (not published to npm). These deps must be removed, not pinned.
  const localOnlyPackages = resolveLocalOnlyWorkspacePackageNames(rootDir);

  // Remove local-only packages from pinned map so they get deleted instead of pinned
  for (const name of localOnlyPackages) {
    pinnedVersions.delete(name);
  }

  return pinnedVersions;
}

/**
 * @param {PackageJsonRecord} pkg
 * @param {{ localOnlyPackages?: Set<string> }} [options]
 * @returns {Set<string>}
 */
export function collectWorkspaceProtocolDependencyNames(
  pkg,
  { localOnlyPackages = new Set() } = {},
) {
  const dependencyNames = new Set();
  for (const field of [...DEPENDENCY_FIELDS, "overrides"]) {
    const deps = pkg?.[field];
    if (!isStringRecord(deps)) continue;
    for (const [dependencyName, specifier] of Object.entries(deps)) {
      if (localOnlyPackages.has(dependencyName)) {
        continue;
      }
      if (!isWorkspaceProtocolSpecifier(specifier)) {
        continue;
      }
      dependencyNames.add(dependencyName);
    }
  }
  return dependencyNames;
}

/**
 * @param {Map<string, string>} pinnedVersions
 * @param {{
 *   dependencyNames?: Set<string>;
 *   versionSources?: Map<string, string>;
 *   readRegistryInfo?: typeof readRegistryPackageInfo;
 *   log?: typeof console.log;
 *   warn?: typeof console.warn;
 * }} [options]
 * @returns {Map<string, string>}
 */
export function resolvePublishSafePinnedVersions(
  pinnedVersions,
  {
    dependencyNames = undefined,
    versionSources = new Map(),
    readRegistryInfo = readRegistryPackageInfo,
    log = console.log,
    warn = console.warn,
  } = {},
) {
  const resolvedVersions = new Map();
  const registryInfoCache = new Map();
  const relevantNames =
    dependencyNames instanceof Set ? dependencyNames : undefined;

  for (const [dependencyName, preferredVersion] of pinnedVersions) {
    const versionSource = versionSources.get(dependencyName);
    const shouldResolveFromRegistry =
      (versionSource === PINNED_VERSION_SOURCE_WORKSPACE ||
        versionSource === PINNED_VERSION_SOURCE_TEMPLATE) &&
      (!relevantNames || relevantNames.has(dependencyName)) &&
      isExactRegistryVersion(preferredVersion);

    if (!shouldResolveFromRegistry) {
      resolvedVersions.set(dependencyName, preferredVersion);
      continue;
    }

    let registryInfo = registryInfoCache.get(dependencyName);
    if (registryInfo === undefined) {
      try {
        registryInfo = readRegistryInfo(dependencyName);
      } catch (error) {
        warn(
          `[disable-local-eliza-workspace] Could not read registry metadata for ${dependencyName}: ${error instanceof Error ? error.message : String(error)}`,
        );
        registryInfo = null;
      }
      registryInfoCache.set(dependencyName, registryInfo);
    }

    const publishSafeVersion = selectPublishedRegistryVersion(
      preferredVersion,
      registryInfo,
    );
    if (publishSafeVersion !== preferredVersion) {
      log(
        `[disable-local-eliza-workspace] Falling back ${dependencyName} ${preferredVersion} -> ${publishSafeVersion} for published-only CI`,
      );
    }
    resolvedVersions.set(dependencyName, publishSafeVersion);
  }

  return resolvedVersions;
}

/**
 * @param {string} rootDir
 * @param {{
 *   localOnlyWorkspaceGlobs?: string[];
 *   localOnlyWorkspacePaths?: string[];
 * }} [options]
 * @returns {Set<string>}
 */
export function resolveLocalOnlyWorkspacePackageNames(
  rootDir,
  {
    localOnlyWorkspaceGlobs = LOCAL_ONLY_WORKSPACE_GLOBS,
    localOnlyWorkspacePaths = LOCAL_ONLY_WORKSPACE_PATHS,
  } = {},
) {
  const localOnlyPackages = new Set();
  for (const glob of localOnlyWorkspaceGlobs) {
    for (const wsRel of expandGlob(glob, { rootDir })) {
      const pkgPath = path.join(rootDir, wsRel, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = readPackageJson(pkgPath);
        if (typeof pkg?.name === "string") localOnlyPackages.add(pkg.name);
      } catch {
        /* skip */
      }
    }
  }
  for (const wsRel of localOnlyWorkspacePaths) {
    const pkgPath = path.join(rootDir, wsRel, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = readPackageJson(pkgPath);
      if (typeof pkg?.name === "string") localOnlyPackages.add(pkg.name);
    } catch {
      /* skip */
    }
  }
  return localOnlyPackages;
}

/**
 * @param {string} rootDir
 * @param {{
 *   localOnlyWorkspaceGlobs?: string[];
 *   localOnlyWorkspacePaths?: string[];
 * }} [options]
 * @returns {Map<string, string>}
 */
export function resolveLocalOnlyWorkspacePackagePaths(
  rootDir,
  {
    localOnlyWorkspaceGlobs = LOCAL_ONLY_WORKSPACE_GLOBS,
    localOnlyWorkspacePaths = LOCAL_ONLY_WORKSPACE_PATHS,
  } = {},
) {
  const localOnlyPackagePaths = new Map();
  for (const glob of localOnlyWorkspaceGlobs) {
    for (const wsRel of expandGlob(glob, { rootDir })) {
      const pkgPath = path.join(rootDir, wsRel, "package.json");
      if (!fs.existsSync(pkgPath)) continue;
      try {
        const pkg = readPackageJson(pkgPath);
        if (typeof pkg?.name === "string") {
          localOnlyPackagePaths.set(pkg.name, wsRel);
        }
      } catch {
        /* skip */
      }
    }
  }
  for (const wsRel of localOnlyWorkspacePaths) {
    const pkgPath = path.join(rootDir, wsRel, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = readPackageJson(pkgPath);
      if (typeof pkg?.name === "string") {
        localOnlyPackagePaths.set(pkg.name, wsRel);
      }
    } catch {
      /* skip */
    }
  }
  return localOnlyPackagePaths;
}

/**
 * @param {PackageJsonRecord} pkg
 * @param {Map<string, string>} [pinnedVersions]
 * @param {{ localOnlyPackages?: Set<string> }} [options]
 * @returns {boolean}
 */
export function rewriteWorkspaceDependencySpecifiers(
  pkg,
  pinnedVersions,
  { localOnlyPackages = new Set() } = {},
) {
  let mutated = false;
  for (const field of [...DEPENDENCY_FIELDS, "overrides"]) {
    const deps = pkg?.[field];
    if (!isStringRecord(deps)) continue;
    for (const [dependencyName, specifier] of Object.entries(deps)) {
      if (localOnlyPackages.has(dependencyName)) {
        continue;
      }
      if (!isWorkspaceProtocolSpecifier(specifier)) {
        continue;
      }
      const pinnedVersion = pinnedVersions.get(dependencyName);
      if (pinnedVersion) {
        deps[dependencyName] = pinnedVersion;
      } else {
        // No published version available — remove the dependency entirely
        // to avoid unresolvable workspace:* references after the rename.
        delete deps[dependencyName];
      }
      mutated = true;
    }
  }
  return mutated;
}

function toPosixRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export function rewriteNestedLocalFileDependencySpecifiers(
  pkg,
  packageDirRel,
  localOnlyPackagePaths,
) {
  let mutated = false;
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg?.[field];
    if (!isStringRecord(deps)) continue;
    for (const [dependencyName, specifier] of Object.entries(deps)) {
      const targetWorkspaceRel = localOnlyPackagePaths.get(dependencyName);
      if (!targetWorkspaceRel) {
        continue;
      }
      if (!isWorkspaceProtocolSpecifier(specifier)) {
        continue;
      }
      const relativeTargetPath = path.relative(
        packageDirRel,
        targetWorkspaceRel,
      );
      deps[dependencyName] = `file:${toPosixRelativePath(relativeTargetPath)}`;
      mutated = true;
    }
  }
  return mutated;
}
export function applyOverrideSpecifiers(
  pkg,
  overrideSpecifiers,
  { log = console.log, label = "CI-only override" } = {},
) {
  const overrides = isStringRecord(pkg.overrides) ? pkg.overrides : {};
  const injected = [];

  for (const [dependencyName, specifier] of Object.entries(
    overrideSpecifiers,
  )) {
    if (overrides[dependencyName] === specifier) {
      continue;
    }
    overrides[dependencyName] = specifier;
    injected.push(`${dependencyName} -> ${specifier}`);
  }

  if (injected.length === 0) {
    return false;
  }

  pkg.overrides = overrides;
  log(
    `[disable-local-eliza-workspace] Added ${injected.length} ${label}(s) (${injected.join(", ")})`,
  );
  return true;
}

/**
 * @param {PackageJsonRecord} pkg
 * @param {{ log?: typeof console.log, repoRoot?: string }} [options]
 * @returns {boolean}
 */
export function applyCiOnlyOverrides(
  pkg,
  { log = console.log, repoRoot = DEFAULT_REPO_ROOT } = {},
) {
  return applyOverrideSpecifiers(pkg, resolveCiOverrideSpecifiers(repoRoot), {
    log,
    label: "CI-only override",
  });
}

export function disableLocalElizaWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  { log = console.log, warn = console.warn, errorLog = console.error } = {},
) {
  const elizaRoot = path.join(repoRoot, "eliza");
  const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");
  const shouldRenameElizaWorkspace =
    process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME === "1";
  const packageJsonPath = path.join(repoRoot, "package.json");
  const elizaPackageJsonPath = path.join(elizaRoot, "package.json");
  const removedLockfiles = [];

  // Version resolution needs package.json files inside eliza/. When
  // MILADY_SKIP_LOCAL_UPSTREAMS=1, init-submodules.mjs intentionally
  // skips eliza, so the directory may be empty/absent. Shallow-init it
  // here so we can read workspace package versions for the rewrite.
  const elizaTypescriptPkg = path.join(
    elizaRoot,
    "packages",
    "typescript",
    "package.json",
  );
  if (
    fs.existsSync(path.join(repoRoot, ".gitmodules")) &&
    !fs.existsSync(elizaTypescriptPkg)
  ) {
    try {
      execSync("git submodule update --init --depth=1 eliza", {
        cwd: repoRoot,
        stdio: "pipe",
      });
      log(
        "[disable-local-eliza-workspace] Shallow-initialized eliza submodule for version resolution",
      );
    } catch (err) {
      warn(
        `[disable-local-eliza-workspace] Could not shallow-init eliza submodule: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const localOnlyPackagePaths = resolveLocalOnlyWorkspacePackagePaths(repoRoot);
  const localOnlyPackages = new Set(localOnlyPackagePaths.keys());

  // Resolve pinned versions BEFORE renaming eliza/ away, since the
  // cloud-agent-template and local package.json files live inside it.
  let earlyRootPkg = null;
  let earlyPinnedVersions = new Map();
  const earlyPinnedVersionSources = new Map();
  if (fs.existsSync(packageJsonPath)) {
    try {
      earlyRootPkg = readPackageJson(packageJsonPath);
      earlyPinnedVersions = resolvePinnedWorkspaceVersions(repoRoot, {
        rootPackage: earlyRootPkg,
        versionSources: earlyPinnedVersionSources,
      });
      if (earlyPinnedVersions.size > 0) {
        log(
          `[disable-local-eliza-workspace] Pre-resolved ${earlyPinnedVersions.size} pinned version(s) before disabling workspace`,
        );
      }
    } catch {
      /* continue — will be read again below */
    }
  }

  if (shouldRenameElizaWorkspace && fs.existsSync(elizaRoot)) {
    fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
    fs.renameSync(elizaRoot, disabledElizaRoot);
    log(
      `[disable-local-eliza-workspace] Disabled repo-local eliza workspace at ${elizaRoot}`,
    );
  } else if (
    !shouldRenameElizaWorkspace &&
    fs.existsSync(elizaRoot) &&
    fs.existsSync(disabledElizaRoot)
  ) {
    fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
    log(
      `[disable-local-eliza-workspace] Removed stale disabled workspace at ${disabledElizaRoot}`,
    );
  } else if (!shouldRenameElizaWorkspace && fs.existsSync(elizaRoot)) {
    log(
      "[disable-local-eliza-workspace] Keeping eliza/ on disk (rewrite-only mode)",
    );
  } else {
    log(
      "[disable-local-eliza-workspace] Repo-local eliza workspace already absent",
    );
  }

  if (!fs.existsSync(packageJsonPath)) {
    log(
      "[disable-local-eliza-workspace] Root package.json not found; skipping workspace patch",
    );
    return {
      rewrites: 0,
      removedWorkspaceGlobs: [],
      pinnedWorkspaceVersions: new Map(),
    };
  }

  const rawRootPkg = fs.readFileSync(packageJsonPath, "utf8");
  /** @type {PackageJsonRecord} */
  let rootPkg;
  try {
    const parsedRootPkg = JSON.parse(rawRootPkg);
    if (!isPackageJsonRecord(parsedRootPkg)) {
      throw new Error(
        `expected a package.json object with string-valued dependency maps`,
      );
    }
    rootPkg = parsedRootPkg;
  } catch (error) {
    errorLog(
      `[disable-local-eliza-workspace] Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }

  const removedWorkspaceGlobs = [];
  if (Array.isArray(rootPkg.workspaces)) {
    const originalWorkspaces = rootPkg.workspaces;
    const filteredWorkspaces = originalWorkspaces.filter((entry) => {
      if (DISABLED_WORKSPACE_GLOBS.includes(entry)) {
        removedWorkspaceGlobs.push(entry);
        return false;
      }
      // Also strip any explicit eliza/ paths (e.g. electrobun, cloud-agent-template)
      // that would vanish when eliza/ is renamed to .eliza.ci-disabled/
      if (
        typeof entry === "string" &&
        entry.startsWith("eliza/") &&
        !LOCAL_ONLY_WORKSPACE_GLOBS.includes(entry) &&
        !LOCAL_ONLY_WORKSPACE_PATHS.includes(entry)
      ) {
        removedWorkspaceGlobs.push(entry);
        return false;
      }
      return true;
    });

    for (const workspacePath of LOCAL_ONLY_WORKSPACE_PATHS) {
      const absoluteWorkspacePath = path.join(repoRoot, workspacePath);
      if (
        fs.existsSync(path.join(absoluteWorkspacePath, "package.json")) &&
        !filteredWorkspaces.includes(workspacePath)
      ) {
        filteredWorkspaces.push(workspacePath);
      }
    }

    if (removedWorkspaceGlobs.length === 0) {
      log(
        `[disable-local-eliza-workspace] Root package.json workspaces array does not include ${DISABLED_WORKSPACE_GLOBS.join(", ")}; nothing to patch`,
      );
    } else {
      rootPkg.workspaces = filteredWorkspaces;
      log(
        `[disable-local-eliza-workspace] Removed ${removedWorkspaceGlobs.join(", ")} from root package.json workspaces`,
      );
    }
  }

  // Strip patchedDependencies whose patch files live inside eliza/ when either:
  // - eliza/ is intentionally renamed away (shouldRenameElizaWorkspace), OR
  // - the patch file does not actually exist on disk (avoids bun install failure
  //   with "Couldn't find patch file: 'eliza/packages/...'" when the submodule
  //   is absent or not initialized).
  if (isStringRecord(rootPkg.patchedDependencies)) {
    const removedPatches = [];
    for (const [dep, patchPath] of Object.entries(
      rootPkg.patchedDependencies,
    )) {
      if (typeof patchPath === "string" && patchPath.startsWith("eliza/")) {
        const absolutePatchPath = path.join(repoRoot, patchPath);
        if (shouldRenameElizaWorkspace || !fs.existsSync(absolutePatchPath)) {
          removedPatches.push(dep);
        }
      }
    }
    for (const dep of removedPatches) {
      delete rootPkg.patchedDependencies[dep];
    }
    if (removedPatches.length > 0) {
      log(
        `[disable-local-eliza-workspace] Removed ${removedPatches.length} patchedDependencies referencing eliza/ (${removedPatches.join(", ")})`,
      );
    }
  }

  // Stub scripts that reference eliza/ paths only when the directory has been
  // renamed away.
  if (shouldRenameElizaWorkspace && isStringRecord(rootPkg.scripts)) {
    const stubbedScripts = [];
    for (const [name, cmd] of Object.entries(rootPkg.scripts)) {
      if (typeof cmd === "string" && cmd.includes("eliza/")) {
        stubbedScripts.push(name);
        rootPkg.scripts[name] =
          "echo '[CI] script disabled — eliza/ workspace not present'";
      }
    }
    if (stubbedScripts.length > 0) {
      log(
        `[disable-local-eliza-workspace] Stubbed ${stubbedScripts.length} scripts referencing eliza/ (${stubbedScripts.slice(0, 5).join(", ")}${stubbedScripts.length > 5 ? ", ..." : ""})`,
      );
    }
  }

  applyCiOnlyOverrides(rootPkg, { log, repoRoot });

  writePackageJson(packageJsonPath, rawRootPkg, rootPkg);

  if (fs.existsSync(elizaPackageJsonPath)) {
    try {
      const rawElizaPkg = fs.readFileSync(elizaPackageJsonPath, "utf8");
      const elizaPkg = parseJsonObject(rawElizaPkg);
      if (!isPackageJsonRecord(elizaPkg)) {
        warn(
          `[disable-local-eliza-workspace] Skipping ${elizaPackageJsonPath}: package.json is malformed`,
        );
      } else if (
        applyOverrideSpecifiers(
          elizaPkg,
          ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS,
          {
            log,
            label: "local eliza runtime override",
          },
        )
      ) {
        writePackageJson(elizaPackageJsonPath, rawElizaPkg, elizaPkg);
      }
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace] Failed to patch ${elizaPackageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Use early-resolved versions (captured before eliza/ was renamed away).
  // Fall back to a post-rename resolution attempt for robustness.
  const latePinnedVersionSources = new Map();
  const pinnedWorkspaceVersions =
    earlyPinnedVersions.size > 0
      ? earlyPinnedVersions
      : resolvePinnedWorkspaceVersions(repoRoot, {
          rootPackage: rootPkg,
          versionSources: latePinnedVersionSources,
        });
  const pinnedVersionSources =
    earlyPinnedVersions.size > 0
      ? earlyPinnedVersionSources
      : latePinnedVersionSources;

  if (!pinnedWorkspaceVersions.has(ELIZAOS_CORE_NAME)) {
    warn(
      "[disable-local-eliza-workspace] Could not resolve a pinned @elizaos/core version from overrides or cloud-agent-template; leaving workspace:* specifiers in place",
    );
    // Still remove lockfiles so Bun regenerates without stale workspace entries
    removedLockfiles.push(...removeStaleLockfiles(repoRoot, { log }));
    return {
      rewrites: 0,
      removedWorkspaceGlobs,
      pinnedWorkspaceVersions,
    };
  }

  const seen = new Set();
  const pendingWorkspaceDirs = [];
  const nestedInstallablePackageDirs = new Set(
    NESTED_INSTALLABLE_PACKAGE_GLOBS.flatMap((glob) =>
      expandGlob(glob, { rootDir: repoRoot }),
    ),
  );
  const rewriteWorkspaceEntries = [
    ...(rootPkg.workspaces ?? []),
    ...removedWorkspaceGlobs,
    ...NESTED_INSTALLABLE_PACKAGE_GLOBS,
  ];

  // In rewrite-only CI the eliza/ checkout stays on disk even after we remove
  // its globs from the root workspace graph. Keep rewriting those package.json
  // files too, because release-check still validates their pinned specs.
  for (const entry of rewriteWorkspaceEntries) {
    const expanded = expandGlob(entry, { rootDir: repoRoot });
    for (const match of expanded) {
      if (!seen.has(match)) {
        seen.add(match);
        pendingWorkspaceDirs.push(match);
      }
    }
  }

  const workspaceProtocolDependencyNames =
    collectWorkspaceProtocolDependencyNames(rootPkg, { localOnlyPackages });
  for (const workspaceRel of pendingWorkspaceDirs) {
    const pkgPath = path.join(repoRoot, workspaceRel, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = readPackageJson(pkgPath);
      if (!pkg) {
        warn(
          `[disable-local-eliza-workspace]   skipped dependency scan for ${workspaceRel}: package.json is missing or malformed`,
        );
        continue;
      }
      for (const dependencyName of collectWorkspaceProtocolDependencyNames(
        pkg,
        {
          localOnlyPackages,
        },
      )) {
        workspaceProtocolDependencyNames.add(dependencyName);
      }
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace]   skipped dependency scan for ${workspaceRel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const publishSafePinnedWorkspaceVersions = resolvePublishSafePinnedVersions(
    pinnedWorkspaceVersions,
    {
      dependencyNames: workspaceProtocolDependencyNames,
      versionSources: pinnedVersionSources,
      log,
      warn,
    },
  );

  log(
    `[disable-local-eliza-workspace] Rewriting workspace specifiers for ${publishSafePinnedWorkspaceVersions.size} package(s) to exact registry versions`,
  );

  let rewrites = 0;
  if (
    rewriteWorkspaceDependencySpecifiers(
      rootPkg,
      publishSafePinnedWorkspaceVersions,
      {
        localOnlyPackages,
      },
    )
  ) {
    writePackageJson(packageJsonPath, rawRootPkg, rootPkg);
    rewrites++;
    log("[disable-local-eliza-workspace]   patched .");
  }

  for (const workspaceRel of pendingWorkspaceDirs) {
    const pkgPath = path.join(repoRoot, workspaceRel, "package.json");
    if (!fs.existsSync(pkgPath)) continue;

    let originalRaw;
    let parsedPkg;
    try {
      originalRaw = fs.readFileSync(pkgPath, "utf8");
      parsedPkg = parseJsonObject(originalRaw);
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace]   skipped ${workspaceRel}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    if (!isPackageJsonRecord(parsedPkg)) {
      warn(
        `[disable-local-eliza-workspace]   skipped ${workspaceRel}: package.json is malformed`,
      );
      continue;
    }
    const pkg = parsedPkg;

    const rewrotePublishedWorkspaceDeps = rewriteWorkspaceDependencySpecifiers(
      pkg,
      publishSafePinnedWorkspaceVersions,
      {
        localOnlyPackages,
      },
    );
    const rewroteNestedLocalFileDeps =
      nestedInstallablePackageDirs.has(workspaceRel) &&
      rewriteNestedLocalFileDependencySpecifiers(
        pkg,
        workspaceRel,
        localOnlyPackagePaths,
      );

    if (!rewrotePublishedWorkspaceDeps && !rewroteNestedLocalFileDeps) {
      continue;
    }
    if (writePackageJson(pkgPath, originalRaw, pkg)) {
      rewrites++;
      log(`[disable-local-eliza-workspace]   patched ${workspaceRel}`);
    }
  }

  if (rewrites === 0) {
    log(
      "[disable-local-eliza-workspace] No disabled upstream workspace specifiers found; nothing rewritten",
    );
  } else {
    log(
      `[disable-local-eliza-workspace] Rewrote disabled upstream workspace specifiers in ${rewrites} package.json file(s)`,
    );
  }

  removedLockfiles.push(...removeStaleLockfiles(repoRoot, { log }));

  return {
    rewrites,
    removedWorkspaceGlobs,
    removedLockfiles,
    pinnedWorkspaceVersions: publishSafePinnedWorkspaceVersions,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);

if (isMain) {
  const skipLocalUpstreams =
    process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
    process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1";
  const runningInCi = process.env.GITHUB_ACTIONS === "true";
  const forced = process.env.MILADY_DISABLE_LOCAL_UPSTREAMS === "force";

  if (!skipLocalUpstreams || (!runningInCi && !forced)) {
    process.exit(0);
  }

  disableLocalElizaWorkspace();
}
