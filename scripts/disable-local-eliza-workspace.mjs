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
 *      registry version selected from root overrides, package metadata, or
 *      the configured elizaOS npm dist-tag. Without this rewrite, Bun hoists
 *      a registry-resolved `@elizaos/core`
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
import {
  getElizaosPackageExactVersion,
  getElizaosPackageSpecifier,
  getExplicitElizaosPackageDistTag,
  isExactRegistryVersion,
  isLocalElizaDisabled,
  selectPublishedPackageVersion,
  selectRegistryPackageVersion,
} from "./lib/eliza-package-mode.mjs";
import { applyTsconfigMode } from "./lib/tsconfig-mode.mjs";

export const ELIZA_WORKSPACE_GLOB = "eliza/packages/*";
export const PLUGIN_ROOT_WORKSPACE_GLOB = "eliza/plugins/*";
export const DISABLED_WORKSPACE_GLOBS = [
  ELIZA_WORKSPACE_GLOB,
  PLUGIN_ROOT_WORKSPACE_GLOB,
];
export const LOCAL_ONLY_WORKSPACE_GLOBS = [
  "eliza/packages/native-plugins/*",
  "eliza/apps/*",
];
export const LOCAL_ONLY_ELIZA_PACKAGE_PATHS = {
  "@elizaos/plugin-agent-wallet": "plugins/plugin-agent-wallet",
  "@elizaos/plugin-browser-bridge": "plugins/plugin-browser-bridge",
  "@elizaos/plugin-app-control": "plugins/plugin-app-control",
  "@elizaos/plugin-signal": "plugins/plugin-signal",
  "@elizaos/plugin-wechat": "plugins/plugin-wechat",
  "@elizaos/skills": "packages/skills",
  "@elizaos/vault": "packages/vault",
};
export const LOCAL_ELIZA_CI_OVERRIDE_PACKAGE_PATHS = {
  "@elizaos/agent": "packages/agent",
  "@elizaos/shared": "packages/shared",
  "@elizaos/ui": "packages/ui",
  "@elizaos/app-core": "packages/app-core",
  ...LOCAL_ONLY_ELIZA_PACKAGE_PATHS,
};
export const LOCAL_ONLY_WORKSPACE_PATHS = [
  "eliza/packages/shared",
  ...Object.values(LOCAL_ONLY_ELIZA_PACKAGE_PATHS).map(
    (packagePath) => `eliza/${packagePath}`,
  ),
];
export const NESTED_INSTALLABLE_PACKAGE_GLOBS = [
  // These package.json files are installed directly by CI/build scripts even
  // though they do not participate in the root workspace graph.
  "eliza/packages/app-core/platforms/*",
];
// Entries point at real packages inside eliza/. Published-only CI still runs
// source paths that import their local builds.
export const CI_OVERRIDE_SPECIFIERS = {
  "@elizaos/agent": "file:./eliza/packages/agent",
  "@elizaos/shared": "file:./eliza/packages/shared",
  "@elizaos/ui": "file:./eliza/packages/ui",
};
export const ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS = {
  "@elizaos/ui": "file:./packages/ui",
  "@elizaos/plugin-browser-bridge": "file:./plugins/plugin-browser-bridge",
  "@elizaos/plugin-signal": "file:./plugins/plugin-signal",
  "@elizaos/skills": "file:./packages/skills",
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
export const LLAMA_CPP_CAPACITOR_PATCH_PATH = path.join(
  "eliza",
  "packages",
  "app-core",
  "patches",
  "llama-cpp-capacitor@0.1.5.patch",
);

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

  const localUiPackageJsonPath = path.join(
    repoRoot,
    "eliza",
    "packages",
    "ui",
    "package.json",
  );
  if (fs.existsSync(localUiPackageJsonPath)) {
    return "file:./eliza/packages/ui";
  }

  return null;
}

export function resolveRootElizaPackageOverrideSpecifier(
  elizaPackageRel,
  repoRoot = DEFAULT_REPO_ROOT,
) {
  const disabledPackageJsonPath = path.join(
    repoRoot,
    ".eliza.ci-disabled",
    elizaPackageRel,
    "package.json",
  );

  if (fs.existsSync(disabledPackageJsonPath)) {
    return `file:./.eliza.ci-disabled/${elizaPackageRel}`;
  }

  const localPackageJsonPath = path.join(
    repoRoot,
    "eliza",
    elizaPackageRel,
    "package.json",
  );
  if (fs.existsSync(localPackageJsonPath)) {
    return `file:./eliza/${elizaPackageRel}`;
  }

  return null;
}

export function resolveCiOverrideSpecifiers(repoRoot = DEFAULT_REPO_ROOT) {
  if (
    isLocalElizaDisabled() &&
    process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_USE_FILE_OVERRIDES !== "1"
  ) {
    return {};
  }

  const overrides = {};
  for (const [packageName, packagePath] of Object.entries(
    LOCAL_ELIZA_CI_OVERRIDE_PACKAGE_PATHS,
  )) {
    const specifier =
      packageName === "@elizaos/ui"
        ? resolveRootUiOverrideSpecifier(repoRoot)
        : resolveRootElizaPackageOverrideSpecifier(packagePath, repoRoot);
    if (specifier) {
      overrides[packageName] = specifier;
    }
  }
  return overrides;
}

/**
 * @typedef {import("./lib/package-types.d.ts").PackageJsonRecord} PackageJsonRecord
 */

/**
 * @typedef {object} RegistryPackageInfo
 * @property {string[] | string=} versions
 * @property {Record<string, string>=} dist-tags
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
    Object.values(value).every((entry) => typeof entry === "string")
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

export function selectRegistryDistTagVersion(registryInfo, options = {}) {
  return selectRegistryPackageVersion(registryInfo, options);
}

/**
 * @param {string} preferredVersion
 * @param {RegistryPackageInfo | null} registryInfo
 * @returns {string}
 */
export function selectPublishedRegistryVersion(
  preferredVersion,
  registryInfo,
  options = {},
) {
  return selectPublishedPackageVersion(preferredVersion, registryInfo, options);
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

export function resolveMissingRegistryPinnedVersions(
  dependencyNames,
  pinnedVersions,
  {
    readRegistryInfo = readRegistryPackageInfo,
    log = console.log,
    warn = console.warn,
  } = {},
) {
  const resolvedVersions = new Map(pinnedVersions);

  for (const dependencyName of dependencyNames) {
    if (resolvedVersions.has(dependencyName)) {
      continue;
    }
    if (!dependencyName.startsWith("@elizaos/")) {
      continue;
    }

    let registryInfo;
    try {
      registryInfo = readRegistryInfo(dependencyName);
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace] Could not read registry metadata for ${dependencyName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    const registryVersion = selectRegistryDistTagVersion(registryInfo);
    if (!registryVersion) {
      continue;
    }

    resolvedVersions.set(dependencyName, registryVersion);
    log(
      `[disable-local-eliza-workspace] Resolved ${dependencyName} -> ${registryVersion} from npm dist-tags`,
    );
  }

  return resolvedVersions;
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
    fileOverrideNames = undefined,
    readRegistryInfo = readRegistryPackageInfo,
    log = console.log,
    warn = console.warn,
  } = {},
) {
  const resolvedVersions = new Map();
  const registryInfoCache = new Map();
  const relevantNames =
    dependencyNames instanceof Set ? dependencyNames : undefined;
  const overriddenNames =
    fileOverrideNames instanceof Set ? fileOverrideNames : undefined;

  for (const [dependencyName, preferredVersion] of pinnedVersions) {
    // Packages with a file:./... override resolve from the local path, never
    // from the registry. Skipping the npm view here avoids 404 noise for
    // unpublished plugin packages mirrored as workspace overrides (e.g.
    // @elizaos/plugin-music-library).
    if (overriddenNames?.has(dependencyName)) {
      resolvedVersions.set(dependencyName, preferredVersion);
      continue;
    }

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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // npm view emits E404 when the package isn't published. That's an
        // expected miss for unpublished workspace packages — log a single
        // tidy line instead of dumping the multi-line npm stderr blob.
        if (
          /\bE404\b/.test(errorMessage) ||
          /404 Not Found/.test(errorMessage)
        ) {
          log(
            `[disable-local-eliza-workspace] ${dependencyName} is not published to npm; keeping workspace-pinned version`,
          );
        } else {
          warn(
            `[disable-local-eliza-workspace] Could not read registry metadata for ${dependencyName}: ${errorMessage}`,
          );
        }
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

function shouldRewriteConfiguredElizaRegistrySpecifiers(env = process.env) {
  return Boolean(
    getElizaosPackageExactVersion(env) ?? getExplicitElizaosPackageDistTag(env),
  );
}

function isRegistryDependencySpecifier(specifier) {
  return (
    typeof specifier === "string" &&
    specifier.length > 0 &&
    !isWorkspaceProtocolSpecifier(specifier) &&
    !specifier.startsWith("file:") &&
    !specifier.startsWith("link:") &&
    !specifier.startsWith("portal:") &&
    !specifier.startsWith("npm:")
  );
}

function resolveConfiguredElizaRegistrySpecifier(
  dependencyName,
  {
    env = process.env,
    readRegistryInfo = readRegistryPackageInfo,
    registryInfoCache = new Map(),
    warn = console.warn,
  } = {},
) {
  const exactVersion = getElizaosPackageExactVersion(env);
  if (exactVersion) {
    return exactVersion;
  }

  const explicitTag = getExplicitElizaosPackageDistTag(env);
  if (!explicitTag) {
    return null;
  }

  let registryInfo = registryInfoCache.get(dependencyName);
  if (registryInfo === undefined) {
    try {
      registryInfo = readRegistryInfo(dependencyName);
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace] Could not read registry metadata for ${dependencyName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      registryInfo = null;
    }
    registryInfoCache.set(dependencyName, registryInfo);
  }

  return (
    selectRegistryPackageVersion(registryInfo, {
      env,
      includeLatestFallback: false,
      includeVersionFallback: false,
    }) ?? getElizaosPackageSpecifier(env)
  );
}

export function rewriteConfiguredElizaRegistrySpecifiers(
  pkg,
  {
    env = process.env,
    localOnlyPackages = new Set(),
    readRegistryInfo = readRegistryPackageInfo,
    registryInfoCache = new Map(),
    log = console.log,
    warn = console.warn,
  } = {},
) {
  if (!shouldRewriteConfiguredElizaRegistrySpecifiers(env)) {
    return false;
  }

  const rewrites = [];
  for (const field of [...DEPENDENCY_FIELDS, "overrides"]) {
    const deps = pkg?.[field];
    if (!isStringRecord(deps)) continue;
    for (const [dependencyName, specifier] of Object.entries(deps)) {
      if (
        !dependencyName.startsWith("@elizaos/") ||
        localOnlyPackages.has(dependencyName) ||
        !isRegistryDependencySpecifier(specifier)
      ) {
        continue;
      }

      const configuredSpecifier = resolveConfiguredElizaRegistrySpecifier(
        dependencyName,
        {
          env,
          readRegistryInfo,
          registryInfoCache,
          warn,
        },
      );
      if (
        !configuredSpecifier ||
        deps[dependencyName] === configuredSpecifier
      ) {
        continue;
      }

      deps[dependencyName] = configuredSpecifier;
      rewrites.push(`${dependencyName} -> ${configuredSpecifier}`);
    }
  }

  if (rewrites.length > 0) {
    log(
      `[disable-local-eliza-workspace] Rewrote ${rewrites.length} configured elizaOS registry specifier(s) (${rewrites.join(", ")})`,
    );
  }
  return rewrites.length > 0;
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

export function repairKnownElizaPatchFiles(
  repoRoot = DEFAULT_REPO_ROOT,
  { log = console.log } = {},
) {
  const patchPath = path.join(repoRoot, LLAMA_CPP_CAPACITOR_PATCH_PATH);
  if (!fs.existsSync(patchPath)) {
    return false;
  }

  const source = fs.readFileSync(patchPath, "utf8");
  const repaired = source.replace(
    "@@ -18,7 +18,7 @@ apply plugin: 'com.android.library'",
    "@@ -18,6 +18,6 @@ apply plugin: 'com.android.library'",
  );
  if (repaired === source) {
    return false;
  }

  fs.writeFileSync(patchPath, repaired);
  log(
    `[disable-local-eliza-workspace] Repaired malformed patch hunk in ${LLAMA_CPP_CAPACITOR_PATCH_PATH}`,
  );
  return true;
}

function preResolvePinnedWorkspaceVersions(repoRoot, packageJsonPath, { log }) {
  let rootPackage = null;
  let pinnedVersions = new Map();
  const versionSources = new Map();

  if (!fs.existsSync(packageJsonPath)) {
    return { rootPackage, pinnedVersions, versionSources };
  }

  try {
    rootPackage = readPackageJson(packageJsonPath);
    pinnedVersions = resolvePinnedWorkspaceVersions(repoRoot, {
      rootPackage,
      versionSources,
    });
    if (pinnedVersions.size > 0) {
      log(
        `[disable-local-eliza-workspace] Pre-resolved ${pinnedVersions.size} pinned version(s) before disabling workspace`,
      );
    }
  } catch {
    /* continue — will be read again below */
  }

  return { rootPackage, pinnedVersions, versionSources };
}

function reconcileElizaWorkspaceDirectory({
  shouldRenameElizaWorkspace,
  elizaRoot,
  disabledElizaRoot,
  log,
}) {
  if (shouldRenameElizaWorkspace && fs.existsSync(elizaRoot)) {
    fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
    fs.renameSync(elizaRoot, disabledElizaRoot);
    log(
      `[disable-local-eliza-workspace] Disabled repo-local eliza workspace at ${elizaRoot}`,
    );
    return;
  }

  if (
    !shouldRenameElizaWorkspace &&
    fs.existsSync(elizaRoot) &&
    fs.existsSync(disabledElizaRoot)
  ) {
    fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
    log(
      `[disable-local-eliza-workspace] Removed stale disabled workspace at ${disabledElizaRoot}`,
    );
    return;
  }

  if (!shouldRenameElizaWorkspace && fs.existsSync(elizaRoot)) {
    log(
      "[disable-local-eliza-workspace] Keeping eliza/ on disk (rewrite-only mode)",
    );
    return;
  }

  log(
    "[disable-local-eliza-workspace] Repo-local eliza workspace already absent",
  );
}

function backupRootPackageJson(repoRoot, rawRootPkg, { log }) {
  const rootPackageBackupPath = path.join(
    repoRoot,
    "package.json.pre-disable-backup",
  );

  if (fs.existsSync(rootPackageBackupPath)) {
    return;
  }

  fs.writeFileSync(rootPackageBackupPath, rawRootPkg);
  log(
    `[disable-local-eliza-workspace] Wrote original package.json backup to ${path.relative(repoRoot, rootPackageBackupPath)}`,
  );
}

function parseRootPackageJson(packageJsonPath, rawRootPkg, { errorLog }) {
  try {
    const parsedRootPkg = JSON.parse(rawRootPkg);
    if (!isPackageJsonRecord(parsedRootPkg)) {
      throw new Error(
        `expected a package.json object with string-valued dependency maps`,
      );
    }
    return parsedRootPkg;
  } catch (error) {
    errorLog(
      `[disable-local-eliza-workspace] Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

function isDisabledWorkspaceEntry(entry) {
  return (
    DISABLED_WORKSPACE_GLOBS.includes(entry) ||
    (typeof entry === "string" &&
      entry.startsWith("eliza/") &&
      !LOCAL_ONLY_WORKSPACE_GLOBS.includes(entry) &&
      !LOCAL_ONLY_WORKSPACE_PATHS.includes(entry))
  );
}

function patchRootWorkspaces(rootPkg, repoRoot, { log }) {
  const removedWorkspaceGlobs = [];

  if (!Array.isArray(rootPkg.workspaces)) {
    return removedWorkspaceGlobs;
  }

  const filteredWorkspaces = rootPkg.workspaces.filter((entry) => {
    if (!isDisabledWorkspaceEntry(entry)) {
      return true;
    }
    removedWorkspaceGlobs.push(entry);
    return false;
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
    return removedWorkspaceGlobs;
  }

  rootPkg.workspaces = filteredWorkspaces;
  log(
    `[disable-local-eliza-workspace] Removed ${removedWorkspaceGlobs.join(", ")} from root package.json workspaces`,
  );
  return removedWorkspaceGlobs;
}

function pruneElizaPatchedDependencies(
  rootPkg,
  repoRoot,
  shouldRenameElizaWorkspace,
  { log },
) {
  if (!isStringRecord(rootPkg.patchedDependencies)) {
    return;
  }

  const removedPatches = [];
  for (const [dep, patchPath] of Object.entries(rootPkg.patchedDependencies)) {
    if (typeof patchPath !== "string" || !patchPath.startsWith("eliza/")) {
      continue;
    }
    const absolutePatchPath = path.join(repoRoot, patchPath);
    if (shouldRenameElizaWorkspace || !fs.existsSync(absolutePatchPath)) {
      removedPatches.push(dep);
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

function stubElizaWorkspaceScripts(
  rootPkg,
  shouldRenameElizaWorkspace,
  { log },
) {
  if (!shouldRenameElizaWorkspace || !isStringRecord(rootPkg.scripts)) {
    return;
  }

  const stubbedScripts = [];
  for (const [name, cmd] of Object.entries(rootPkg.scripts)) {
    if (typeof cmd !== "string" || !cmd.includes("eliza/")) {
      continue;
    }
    stubbedScripts.push(name);
    rootPkg.scripts[name] =
      "echo '[CI] script disabled — eliza/ workspace not present'";
  }

  if (stubbedScripts.length > 0) {
    log(
      `[disable-local-eliza-workspace] Stubbed ${stubbedScripts.length} scripts referencing eliza/ (${stubbedScripts.slice(0, 5).join(", ")}${stubbedScripts.length > 5 ? ", ..." : ""})`,
    );
  }
}

function patchLocalElizaPackage({
  shouldTouchLocalElizaWorkspace,
  elizaPackageJsonPath,
  log,
  warn,
}) {
  if (!shouldTouchLocalElizaWorkspace || !fs.existsSync(elizaPackageJsonPath)) {
    return;
  }

  try {
    const rawElizaPkg = fs.readFileSync(elizaPackageJsonPath, "utf8");
    const elizaPkg = parseJsonObject(rawElizaPkg);
    if (!isPackageJsonRecord(elizaPkg)) {
      warn(
        `[disable-local-eliza-workspace] Skipping ${elizaPackageJsonPath}: package.json is malformed`,
      );
      return;
    }
    if (
      applyOverrideSpecifiers(elizaPkg, ELIZA_RUNTIME_CI_OVERRIDE_SPECIFIERS, {
        log,
        label: "local eliza runtime override",
      })
    ) {
      writePackageJson(elizaPackageJsonPath, rawElizaPkg, elizaPkg);
    }
  } catch (error) {
    warn(
      `[disable-local-eliza-workspace] Failed to patch ${elizaPackageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function resolvePinnedWorkspaceVersionState({
  earlyPinnedVersions,
  earlyPinnedVersionSources,
  repoRoot,
  rootPkg,
}) {
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

  return { pinnedWorkspaceVersions, pinnedVersionSources };
}

function resolvePendingWorkspaceRewriteTargets({
  rootPkg,
  repoRoot,
  removedWorkspaceGlobs,
  shouldTouchLocalElizaWorkspace,
}) {
  const seen = new Set();
  const pendingWorkspaceDirs = [];
  const nestedInstallablePackageDirs = new Set(
    NESTED_INSTALLABLE_PACKAGE_GLOBS.flatMap((glob) =>
      expandGlob(glob, { rootDir: repoRoot }),
    ),
  );
  const rewriteWorkspaceEntries = [
    ...(rootPkg.workspaces ?? []),
    ...(shouldTouchLocalElizaWorkspace ? removedWorkspaceGlobs : []),
    ...(shouldTouchLocalElizaWorkspace ? NESTED_INSTALLABLE_PACKAGE_GLOBS : []),
  ];

  for (const entry of rewriteWorkspaceEntries) {
    const expanded = expandGlob(entry, { rootDir: repoRoot });
    for (const match of expanded) {
      if (seen.has(match)) {
        continue;
      }
      seen.add(match);
      pendingWorkspaceDirs.push(match);
    }
  }

  return { pendingWorkspaceDirs, nestedInstallablePackageDirs };
}

function collectPendingWorkspaceDependencyNames({
  rootPkg,
  pendingWorkspaceDirs,
  repoRoot,
  localOnlyPackages,
  warn,
}) {
  const dependencyNames = collectWorkspaceProtocolDependencyNames(rootPkg, {
    localOnlyPackages,
  });

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
        { localOnlyPackages },
      )) {
        dependencyNames.add(dependencyName);
      }
    } catch (error) {
      warn(
        `[disable-local-eliza-workspace]   skipped dependency scan for ${workspaceRel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return dependencyNames;
}

function rewriteRootPackageDependencies({
  rootPkg,
  packageJsonPath,
  rawRootPkg,
  publishSafePinnedWorkspaceVersions,
  localOnlyPackages,
  registrySpecifierCache,
  log,
  warn,
}) {
  const rewroteRootWorkspaceDeps = rewriteWorkspaceDependencySpecifiers(
    rootPkg,
    publishSafePinnedWorkspaceVersions,
    { localOnlyPackages },
  );
  const rewroteRootRegistryDeps = rewriteConfiguredElizaRegistrySpecifiers(
    rootPkg,
    {
      localOnlyPackages,
      registryInfoCache: registrySpecifierCache,
      log,
      warn,
    },
  );

  if (!rewroteRootWorkspaceDeps && !rewroteRootRegistryDeps) {
    return 0;
  }

  writePackageJson(packageJsonPath, rawRootPkg, rootPkg);
  log("[disable-local-eliza-workspace]   patched .");
  return 1;
}

function rewritePendingWorkspacePackage({
  workspaceRel,
  repoRoot,
  publishSafePinnedWorkspaceVersions,
  localOnlyPackages,
  registrySpecifierCache,
  nestedInstallablePackageDirs,
  localOnlyPackagePaths,
  log,
  warn,
}) {
  const pkgPath = path.join(repoRoot, workspaceRel, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return 0;
  }

  let originalRaw;
  let parsedPkg;
  try {
    originalRaw = fs.readFileSync(pkgPath, "utf8");
    parsedPkg = parseJsonObject(originalRaw);
  } catch (error) {
    warn(
      `[disable-local-eliza-workspace]   skipped ${workspaceRel}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 0;
  }

  if (!isPackageJsonRecord(parsedPkg)) {
    warn(
      `[disable-local-eliza-workspace]   skipped ${workspaceRel}: package.json is malformed`,
    );
    return 0;
  }

  const rewrotePublishedWorkspaceDeps = rewriteWorkspaceDependencySpecifiers(
    parsedPkg,
    publishSafePinnedWorkspaceVersions,
    { localOnlyPackages },
  );
  const rewroteConfiguredRegistryDeps =
    rewriteConfiguredElizaRegistrySpecifiers(parsedPkg, {
      localOnlyPackages,
      registryInfoCache: registrySpecifierCache,
      log,
      warn,
    });
  const rewroteNestedLocalFileDeps =
    nestedInstallablePackageDirs.has(workspaceRel) &&
    rewriteNestedLocalFileDependencySpecifiers(
      parsedPkg,
      workspaceRel,
      localOnlyPackagePaths,
    );

  if (
    !rewrotePublishedWorkspaceDeps &&
    !rewroteConfiguredRegistryDeps &&
    !rewroteNestedLocalFileDeps
  ) {
    return 0;
  }

  if (!writePackageJson(pkgPath, originalRaw, parsedPkg)) {
    return 0;
  }

  log(`[disable-local-eliza-workspace]   patched ${workspaceRel}`);
  return 1;
}

export function disableLocalElizaWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  { log = console.log, warn = console.warn, errorLog = console.error } = {},
) {
  const elizaRoot = path.join(repoRoot, "eliza");
  const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");
  const shouldRenameElizaWorkspace =
    process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_RENAME === "1";
  const shouldTouchLocalElizaWorkspace =
    process.env.MILADY_DISABLE_LOCAL_UPSTREAMS_TOUCH_LOCAL_ELIZA === "1";
  const packageJsonPath = path.join(repoRoot, "package.json");
  const elizaPackageJsonPath = path.join(elizaRoot, "package.json");
  const removedLockfiles = [];

  if (shouldTouchLocalElizaWorkspace) {
    repairKnownElizaPatchFiles(repoRoot, { log });
  }

  const localOnlyPackagePaths = resolveLocalOnlyWorkspacePackagePaths(repoRoot);
  const localOnlyPackages = new Set(localOnlyPackagePaths.keys());

  const {
    pinnedVersions: earlyPinnedVersions,
    versionSources: earlyPinnedVersionSources,
  } = preResolvePinnedWorkspaceVersions(repoRoot, packageJsonPath, { log });

  reconcileElizaWorkspaceDirectory({
    shouldRenameElizaWorkspace,
    elizaRoot,
    disabledElizaRoot,
    log,
  });

  applyTsconfigMode(repoRoot, "packages", { log });

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
  backupRootPackageJson(repoRoot, rawRootPkg, { log });

  const rootPkg = parseRootPackageJson(packageJsonPath, rawRootPkg, {
    errorLog,
  });
  const removedWorkspaceGlobs = patchRootWorkspaces(rootPkg, repoRoot, {
    log,
  });
  pruneElizaPatchedDependencies(rootPkg, repoRoot, shouldRenameElizaWorkspace, {
    log,
  });
  stubElizaWorkspaceScripts(rootPkg, shouldRenameElizaWorkspace, { log });

  applyCiOnlyOverrides(rootPkg, { log, repoRoot });

  writePackageJson(packageJsonPath, rawRootPkg, rootPkg);

  patchLocalElizaPackage({
    shouldTouchLocalElizaWorkspace,
    elizaPackageJsonPath,
    log,
    warn,
  });

  const { pinnedWorkspaceVersions, pinnedVersionSources } =
    resolvePinnedWorkspaceVersionState({
      earlyPinnedVersions,
      earlyPinnedVersionSources,
      repoRoot,
      rootPkg,
    });
  const { pendingWorkspaceDirs, nestedInstallablePackageDirs } =
    resolvePendingWorkspaceRewriteTargets({
      rootPkg,
      repoRoot,
      removedWorkspaceGlobs,
      shouldTouchLocalElizaWorkspace,
    });
  const workspaceProtocolDependencyNames =
    collectPendingWorkspaceDependencyNames({
      rootPkg,
      pendingWorkspaceDirs,
      repoRoot,
      localOnlyPackages,
      warn,
    });

  const registryResolvedPinnedWorkspaceVersions =
    resolveMissingRegistryPinnedVersions(
      workspaceProtocolDependencyNames,
      pinnedWorkspaceVersions,
      { log, warn },
    );

  if (!registryResolvedPinnedWorkspaceVersions.has(ELIZAOS_CORE_NAME)) {
    warn(
      "[disable-local-eliza-workspace] Could not resolve a pinned @elizaos/core version from overrides, cloud-agent-template, local workspace metadata, or npm dist-tags; leaving workspace:* specifiers in place",
    );
    // Still remove lockfiles so Bun regenerates without stale workspace entries
    removedLockfiles.push(...removeStaleLockfiles(repoRoot, { log }));
    return {
      rewrites: 0,
      removedWorkspaceGlobs,
      pinnedWorkspaceVersions: registryResolvedPinnedWorkspaceVersions,
    };
  }

  const ciOverrideNames = new Set(
    Object.keys(resolveCiOverrideSpecifiers(repoRoot)),
  );
  const publishSafePinnedWorkspaceVersions = resolvePublishSafePinnedVersions(
    registryResolvedPinnedWorkspaceVersions,
    {
      dependencyNames: workspaceProtocolDependencyNames,
      versionSources: pinnedVersionSources,
      fileOverrideNames: ciOverrideNames,
      log,
      warn,
    },
  );

  log(
    `[disable-local-eliza-workspace] Rewriting workspace specifiers for ${publishSafePinnedWorkspaceVersions.size} package(s) to exact registry versions`,
  );

  let rewrites = 0;
  const registrySpecifierCache = new Map();
  rewrites += rewriteRootPackageDependencies({
    rootPkg,
    packageJsonPath,
    rawRootPkg,
    publishSafePinnedWorkspaceVersions,
    localOnlyPackages,
    registrySpecifierCache,
    log,
    warn,
  });

  for (const workspaceRel of pendingWorkspaceDirs) {
    rewrites += rewritePendingWorkspacePackage({
      workspaceRel,
      repoRoot,
      publishSafePinnedWorkspaceVersions,
      localOnlyPackages,
      registrySpecifierCache,
      nestedInstallablePackageDirs,
      localOnlyPackagePaths,
      log,
      warn,
    });
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
  const skipLocalUpstreams = isLocalElizaDisabled();
  const runningInCi = process.env.GITHUB_ACTIONS === "true";
  const forced = process.env.MILADY_DISABLE_LOCAL_UPSTREAMS === "force";

  if (!skipLocalUpstreams || (!runningInCi && !forced)) {
    process.exit(0);
  }

  disableLocalElizaWorkspace();
}
