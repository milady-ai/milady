import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const skipLocalUpstreams =
  process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
  process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1";

/**
 * Return the repo-local eliza core workspace root when it is checked out as
 * part of the Milady repo. This avoids relying on node_modules symlinks which
 * Bun can rewrite differently across fresh CI installs.
 */
function getRepoLocalElizaCoreRoot(
  packageName: string,
  repoRoot: string,
): string | undefined {
  if (packageName !== "@elizaos/core" || skipLocalUpstreams) {
    return undefined;
  }

  const elizaRoots = [
    path.resolve(repoRoot, "eliza"),
    path.resolve(repoRoot, "..", "eliza"),
  ];

  for (const elizaRoot of elizaRoots) {
    if (!existsSync(path.join(elizaRoot, "package.json"))) {
      continue;
    }

    const candidate = path.join(elizaRoot, "packages", "typescript");
    if (!existsSync(path.join(candidate, "package.json"))) {
      continue;
    }

    if (
      existsSync(path.join(candidate, "dist", "node", "index.node.js")) ||
      existsSync(path.join(candidate, "dist", "index.js")) ||
      existsSync(path.join(candidate, "src", "index.node.ts")) ||
      existsSync(path.join(candidate, "src", "index.ts")) ||
      existsSync(path.join(candidate, "index.node.ts")) ||
      existsSync(path.join(candidate, "index.ts"))
    ) {
      return candidate;
    }
  }

  return undefined;
}

const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const require = createRequire(import.meta.url);

function getRequireFor(baseDir?: string) {
  if (!baseDir) {
    return require;
  }

  return createRequire(path.join(baseDir, "package.json"));
}

function firstExistingPath(
  candidates: Array<string | undefined>,
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && existsSync(candidate),
  );
}

export function resolveModuleEntry(basePath: string): string {
  if (existsSync(basePath)) {
    return basePath;
  }

  const withExtension = firstExistingPath(
    MODULE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
  );

  return withExtension ?? basePath;
}

export function getInstalledPackageRoot(
  packageName: string,
  fromDir?: string,
): string | undefined {
  // Prefer the repo-local eliza core checkout to avoid Bun reverting symlinks
  // or depending on registry package export quirks during fresh CI installs.
  if (fromDir) {
    const localPackage = getRepoLocalElizaCoreRoot(packageName, fromDir);
    if (localPackage) return localPackage;
  }

  const scopedRequire = getRequireFor(fromDir);

  try {
    return path.dirname(scopedRequire.resolve(`${packageName}/package.json`));
  } catch {
    try {
      const entryPath = scopedRequire.resolve(packageName);
      return path.dirname(entryPath);
    } catch {
      return undefined;
    }
  }
}

export function getInstalledPackageEntry(
  packageName: string,
  repoRoot: string,
  subpath?: "node",
): string | undefined {
  const packageRoot = getInstalledPackageRoot(packageName, repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  const candidates =
    subpath === "node"
      ? [
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "src", "index.node"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "index"),
        ]
      : [
          path.join(packageRoot, "dist", "node", "index.node"),
          path.join(packageRoot, "dist", "index"),
          path.join(packageRoot, "src", "index"),
          path.join(packageRoot, "index.node"),
          path.join(packageRoot, "index"),
        ];

  const resolvedCandidate = candidates
    .map((candidate) => resolveModuleEntry(candidate))
    .find((candidate) => existsSync(candidate));

  return resolvedCandidate ?? resolveModuleEntry(candidates[0]);
}

export function getElizaCoreEntry(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  const candidates = [
    path.join(packageRoot, "dist", "node", "index.node"),
    path.join(packageRoot, "dist", "index"),
    path.join(packageRoot, "src", "index.node"),
    path.join(packageRoot, "src", "index"),
    path.join(packageRoot, "index.node"),
    path.join(packageRoot, "index"),
  ];

  const resolvedCandidate = candidates
    .map((candidate) => resolveModuleEntry(candidate))
    .find((candidate) => existsSync(candidate));

  return resolvedCandidate ?? resolveModuleEntry(candidates[0]);
}

export function getAutonomousSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@miladyai/agent", repoRoot);

  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const directSrc = path.join(packageRoot, "src");
  if (existsSync(directSrc)) {
    return directSrc;
  }

  return path.join(packageRoot, "packages", "agent", "src");
}

export function getAppCoreSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@miladyai/app-core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(sourceRoot) ? sourceRoot : packageRoot;
}
