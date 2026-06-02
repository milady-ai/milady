// Mirror of the bash `symlink_installed_packages_into_manifest_node_modules`
// function from scripts/install-published-workspace-fallback-deps.sh.
//
// Why this exists as Node: the bash version on Windows iterated package-by-
// package and spawned `cygpath` + `cmd.exe /C "rmdir"` + `cmd.exe /C "mklink /J"`
// per package across multiple manifest passes — hundreds of cygwin forks on
// the runner. Under load, MSYS2's fork would intermittently fail with
// `child_copy: cygheap read copy failed, ... Win32 error 299` and crash the
// shell mid-script, which surfaced as a cancelled `website-blocker-startup-smoke`
// matrix entry. Doing the same work in a single Node process eliminates that
// fork pressure and uses `fs.symlinkSync(..., "junction")` instead of cmd.exe.
import fs from "node:fs";
import path from "node:path";

function readManifestDependencyNames(manifestPath) {
  const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const seen = new Set();
  for (const field of ["dependencies", "devDependencies"]) {
    const block = pkg[field];
    if (!block) continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== "string" || spec.length === 0) continue;
      seen.add(name);
    }
  }
  return seen;
}

function compareVersions(left, right) {
  const leftParts = String(left)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const rightParts = String(right)
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return String(left).localeCompare(String(right));
}

function collectBunStorePackages(repoRoot) {
  const store = path.join(repoRoot, "node_modules", ".bun");
  const packages = new Map();
  if (!fs.existsSync(store)) return packages;

  for (const entry of fs.readdirSync(store).sort()) {
    const modulesDir = path.join(store, entry, "node_modules");
    if (!fs.existsSync(modulesDir)) continue;
    for (const topLevel of fs.readdirSync(modulesDir).sort()) {
      if (topLevel.startsWith(".")) continue;
      const topLevelPath = path.join(modulesDir, topLevel);
      const packageDirs = topLevel.startsWith("@")
        ? fs
            .readdirSync(topLevelPath)
            .sort()
            .map((name) => path.join(topLevelPath, name))
        : [topLevelPath];
      for (const packageDir of packageDirs) {
        try {
          const stat = fs.lstatSync(packageDir);
          if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
          const pkg = JSON.parse(
            fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
          );
          if (typeof pkg.name !== "string") continue;
          const version =
            typeof pkg.version === "string" ? pkg.version : "0.0.0";
          const current = packages.get(pkg.name);
          if (!current || compareVersions(version, current.version) > 0) {
            packages.set(pkg.name, { version, packageDir });
          }
        } catch {}
      }
    }
  }
  return packages;
}

function removeExisting(targetPath) {
  let lstat;
  try {
    lstat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (lstat.isDirectory() && !lstat.isSymbolicLink()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }
}

function linkPackageIntoTarget(packageName, sourcePath, targetNodeModules) {
  if (!fs.existsSync(sourcePath)) return;

  const targetPath = path.join(targetNodeModules, packageName);
  const absSource = path.resolve(sourcePath);
  if (absSource === path.resolve(targetPath)) return;

  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });

  removeExisting(targetPath);

  // Use a junction on Windows (works without admin and matches what `mklink /J`
  // produced); use a regular dir symlink everywhere else. Both target absolute
  // paths so links resolve regardless of the consumer's cwd.
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    fs.symlinkSync(absSource, targetPath, linkType);
  } catch (error) {
    // Fallback: copy the directory if symlinking is forbidden (rare, e.g.
    // restricted Windows volumes without symlink privilege).
    if (error.code === "EPERM" || error.code === "ENOTSUP") {
      fs.cpSync(absSource, targetPath, { recursive: true, dereference: true });
      return;
    }
    throw error;
  }
}

export function symlinkStorePackagesForManifest({
  manifest,
  linkAllStorePackages,
  repoRoot,
}) {
  const root = repoRoot ?? process.cwd();
  const manifestPath = path.isAbsolute(manifest)
    ? manifest
    : path.join(root, manifest);

  if (!fs.existsSync(manifestPath)) return;

  const packageDir = path.dirname(manifestPath);
  const targetNodeModules = path.join(packageDir, "node_modules");
  fs.mkdirSync(targetNodeModules, { recursive: true });

  const declaredDeps = readManifestDependencyNames(manifestPath);

  // First pass: link declared deps from the root node_modules.
  for (const name of declaredDeps) {
    const source = path.join(root, "node_modules", name);
    if (!fs.existsSync(source)) continue;
    linkPackageIntoTarget(name, source, targetNodeModules);
  }

  // Bun can keep installed packages only in node_modules/.bun on every runner
  // OS. Link those store packages too so restored source workspaces resolve
  // runtime deps like @elizaos/plugin-local-embedding from their own package dir.
  const storePackages = collectBunStorePackages(root);
  const sortedNames = [...storePackages.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const name of sortedNames) {
    if (!linkAllStorePackages && !declaredDeps.has(name)) continue;
    const targetPath = path.join(targetNodeModules, name);
    if (fs.existsSync(targetPath)) {
      // Match the bash function: skip if anything already exists at target
      // (declared-dep pass above may have linked it already).
      try {
        if (fs.lstatSync(targetPath)) continue;
      } catch {}
    }
    const { packageDir: sourceDir } = storePackages.get(name);
    linkPackageIntoTarget(name, sourceDir, targetNodeModules);
  }
}

function parseArgs(argv) {
  if (argv.length < 1) {
    throw new Error(
      "Usage: symlink-store-packages.mjs <manifest> [linkAllStorePackages]",
    );
  }
  const [manifest, linkAllRaw] = argv;
  return {
    manifest,
    linkAllStorePackages: linkAllRaw === "1" || linkAllRaw === "true",
  };
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("symlink-store-packages.mjs");

if (isMainModule) {
  const { manifest, linkAllStorePackages } = parseArgs(process.argv.slice(2));
  symlinkStorePackagesForManifest({
    manifest,
    linkAllStorePackages,
    repoRoot: process.cwd(),
  });
}
