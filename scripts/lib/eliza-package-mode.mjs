export const DEFAULT_ELIZA_SOURCE_MODE = "packages";
export const DEFAULT_ELIZA_GIT_URL = "https://github.com/elizaOS/eliza.git";
export const DEFAULT_ELIZA_BRANCH = "develop";
export const DEFAULT_ELIZAOS_PACKAGE_DIST_TAG = "alpha";

export const ELIZA_SOURCE_MODE_ENV_KEYS = [
  "MILADY_ELIZA_SOURCE",
  "ELIZA_SOURCE",
];
export const LOCAL_UPSTREAM_SKIP_ENV_KEYS = [
  "MILADY_SKIP_LOCAL_UPSTREAMS",
  "ELIZA_SKIP_LOCAL_UPSTREAMS",
];
export const LOCAL_UPSTREAM_FORCE_ENV_KEYS = [
  "MILADY_FORCE_LOCAL_UPSTREAMS",
  "ELIZA_FORCE_LOCAL_UPSTREAMS",
];
export const ELIZAOS_PACKAGE_DIST_TAG_ENV_KEYS = [
  "MILADY_ELIZAOS_DIST_TAG",
  "ELIZAOS_DIST_TAG",
  "MILADY_ELIZAOS_NPM_TAG",
  "ELIZAOS_NPM_TAG",
];
export const ELIZAOS_PACKAGE_VERSION_ENV_KEYS = [
  "MILADY_ELIZAOS_VERSION",
  "ELIZAOS_VERSION",
];

const LOCAL_SOURCE_MODES = new Set(["local", "source", "workspace"]);
const PACKAGE_SOURCE_MODES = new Set([
  "package",
  "packages",
  "published",
  "npm",
  "registry",
  "global",
]);

function firstEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function getExplicitElizaSourceMode(env = process.env) {
  const rawMode = firstEnvValue(env, ELIZA_SOURCE_MODE_ENV_KEYS);
  if (!rawMode) {
    return null;
  }

  const mode = rawMode.toLowerCase();
  if (LOCAL_SOURCE_MODES.has(mode)) {
    return "local";
  }
  if (PACKAGE_SOURCE_MODES.has(mode)) {
    return "packages";
  }

  throw new Error(
    `Unsupported elizaOS source mode "${rawMode}". Use local or packages.`,
  );
}

export function getElizaSourceMode(env = process.env) {
  return getExplicitElizaSourceMode(env) ?? DEFAULT_ELIZA_SOURCE_MODE;
}

export function isLocalElizaDisabled(env = process.env) {
  if (getElizaSourceMode(env) === "packages") return true;
  return LOCAL_UPSTREAM_SKIP_ENV_KEYS.some((key) => env[key] === "1");
}

export function isLocalElizaForced(env = process.env) {
  if (getExplicitElizaSourceMode(env) === "local") {
    return true;
  }
  return LOCAL_UPSTREAM_FORCE_ENV_KEYS.some((key) => env[key] === "1");
}

export function getElizaGitUrl(env = process.env) {
  return (
    firstEnvValue(env, ["MILADY_ELIZA_GIT_URL", "ELIZA_GIT_URL"]) ??
    DEFAULT_ELIZA_GIT_URL
  );
}

export function getElizaGitBranch(env = process.env) {
  return (
    firstEnvValue(env, ["MILADY_ELIZA_BRANCH", "ELIZA_BRANCH"]) ??
    DEFAULT_ELIZA_BRANCH
  );
}

export function getElizaosPackageExactVersion(env = process.env) {
  return firstEnvValue(env, ELIZAOS_PACKAGE_VERSION_ENV_KEYS);
}

export function getExplicitElizaosPackageDistTag(env = process.env) {
  return firstEnvValue(env, ELIZAOS_PACKAGE_DIST_TAG_ENV_KEYS);
}

export function getElizaosPackageDistTag(env = process.env) {
  return (
    getExplicitElizaosPackageDistTag(env) ?? DEFAULT_ELIZAOS_PACKAGE_DIST_TAG
  );
}

export function getElizaosPackageSpecifier(env = process.env) {
  return getElizaosPackageExactVersion(env) ?? getElizaosPackageDistTag(env);
}

export function getElizaosPackageDistTagCandidates(
  env = process.env,
  { includeLatestFallback = true } = {},
) {
  const primary = getElizaosPackageDistTag(env);
  return unique([
    primary,
    includeLatestFallback && primary !== "latest" ? "latest" : null,
  ]);
}

export function isExactRegistryVersion(specifier) {
  return typeof specifier === "string" && /^\d+\.\d+\.\d+/.test(specifier);
}

export function selectRegistryPackageVersion(
  registryInfo,
  {
    env = process.env,
    includeLatestFallback = true,
    includeVersionFallback = true,
  } = {},
) {
  const exactVersion = getElizaosPackageExactVersion(env);
  if (isExactRegistryVersion(exactVersion)) {
    return exactVersion;
  }

  const distTags = registryInfo?.["dist-tags"] ?? {};
  for (const tag of getElizaosPackageDistTagCandidates(env, {
    includeLatestFallback,
  })) {
    const version = distTags[tag];
    if (isExactRegistryVersion(version)) {
      return version;
    }
  }

  if (includeVersionFallback && isExactRegistryVersion(registryInfo?.version)) {
    return registryInfo.version;
  }

  return null;
}

export function selectPublishedPackageVersion(
  preferredVersion,
  registryInfo,
  options = {},
) {
  const env = options.env ?? process.env;
  const exactVersion = getElizaosPackageExactVersion(env);
  if (isExactRegistryVersion(exactVersion)) {
    return exactVersion;
  }

  if (getExplicitElizaosPackageDistTag(env)) {
    return (
      selectRegistryPackageVersion(registryInfo, {
        ...options,
        env,
        includeLatestFallback: false,
        includeVersionFallback: false,
      }) ?? getElizaosPackageSpecifier(env)
    );
  }

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

  return (
    selectRegistryPackageVersion(registryInfo, options) ?? preferredVersion
  );
}
