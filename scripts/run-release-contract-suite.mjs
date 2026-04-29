#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const appCoreRoot = path.resolve(repoRoot, "eliza", "packages", "app-core");
const legacyElectrobunDir = path.join(repoRoot, "apps", "app", "electrobun");
const canonicalElectrobunDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);
export const releaseContractTests = [
  "scripts/release-workflow-path-contract.test.ts",
  "scripts/run-release-contract-suite.test.ts",
  "scripts/build-local-eliza-ci-overrides.test.ts",
  "scripts/disable-local-eliza-workspace.test.ts",
  "scripts/patch-mobile-build-release-compat.test.ts",
  "scripts/patch-release-check-pack-fallback.test.ts",
  "scripts/electrobun-pr-workflow-contract.test.ts",
  "eliza/packages/app-core/scripts/electrobun-release-workflow-drift.test.ts",
  "eliza/packages/app-core/scripts/release-check.test.ts",
  "eliza/packages/app-core/scripts/static-asset-manifest.test.ts",
];

export function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
    },
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(" ")}`,
    );
  }
}

export function isElizaWorktreeClean(root = repoRoot) {
  const result = spawnSync("git", ["-C", "eliza", "status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return result.status === 0 && result.stdout.trim().length === 0;
}

export function listElizaUntrackedFiles(root = repoRoot) {
  const result = spawnSync(
    "git",
    ["-C", "eliza", "ls-files", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function restoreGeneratedElizaChanges(
  shouldRestore,
  root = repoRoot,
  initialUntrackedFiles = [],
) {
  if (!shouldRestore) {
    return false;
  }

  let restored = false;
  const diff = spawnSync("git", ["-C", "eliza", "diff", "--binary"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (diff.status === 0 && diff.stdout.trim().length > 0) {
    const apply = spawnSync("git", ["-C", "eliza", "apply", "-R", "-"], {
      cwd: root,
      encoding: "utf8",
      input: diff.stdout,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (apply.status !== 0) {
      const stderr = apply.stderr.trim();
      throw new Error(
        stderr || "failed to restore generated eliza release-contract changes",
      );
    }
    restored = true;
  }

  const initialUntracked = new Set(initialUntrackedFiles);
  for (const relativePath of listElizaUntrackedFiles(root)) {
    if (initialUntracked.has(relativePath)) {
      continue;
    }
    fs.rmSync(path.join(root, "eliza", relativePath), {
      force: true,
      recursive: true,
    });
    restored = true;
  }

  return restored;
}

export function symlinkOrCopy(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isDirectory()) {
    fs.symlinkSync(
      path.relative(path.dirname(targetPath), sourcePath),
      targetPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

export function assertReleaseContractTestsExist(
  tests = releaseContractTests,
  root = repoRoot,
) {
  const missing = tests.filter(
    (testPath) => !fs.existsSync(path.join(root, testPath)),
  );

  if (missing.length > 0) {
    throw new Error(
      `Release contract suite references missing test files:\n${missing
        .map((testPath) => `- ${testPath}`)
        .join("\n")}`,
    );
  }
}

export function writeLegacyWindowsSmokeScript(sourcePath, targetPath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const markers = [
    'Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"',
    '$requireInstaller = $env:ELIZA_WINDOWS_SMOKE_REQUIRE_INSTALLER -eq "1"',
    "$persistLauncherPathFile = $env:ELIZA_TEST_WINDOWS_LAUNCHER_PATH_FILE",
    '$startupSessionId = "eliza-windows-smoke-"',
  ]
    .map((line) => `# release-check legacy marker: ${line}`)
    .join("\n");

  fs.writeFileSync(targetPath, `${markers}\n${source}`);
}

export function writeLegacyWindowsInstallerProofScript(sourcePath, targetPath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const markers = ["Eliza-Setup-*.exe", "ELIZA_WINDOWS_SMOKE_REQUIRE_INSTALLER"]
    .map((line) => `# release-check legacy marker: ${line}`)
    .join("\n");

  fs.writeFileSync(targetPath, `${markers}\n${source}`);
}

export function copyLegacyScriptsCompatDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (fs.existsSync(targetPath)) {
      continue;
    }

    if (entry.name === "smoke-test-windows.ps1") {
      writeLegacyWindowsSmokeScript(sourcePath, targetPath);
      continue;
    }

    if (entry.name === "verify-windows-installer-proof.ps1") {
      writeLegacyWindowsInstallerProofScript(sourcePath, targetPath);
      continue;
    }

    symlinkOrCopy(sourcePath, targetPath);
  }
}

export function writeLegacyElectrobunWrapper(
  wrapperPath,
  canonicalConfigImportPath = "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
) {
  const wrapperSource = `import canonicalConfig from "${canonicalConfigImportPath}";

// release-check legacy marker: "postBuild: "scripts/postwrap-sign-runtime-macos.ts""
// release-check legacy marker: "postWrap: "scripts/postwrap-diagnostics.ts""
// release-check legacy marker: "process.env.ELIZA_ELECTROBUN_NOTARIZE ??"
// release-check legacy marker: ""../../../plugins.json": \`\${runtimeDistDir}/plugins.json\`"
// release-check legacy marker: ""../../../package.json": \`\${runtimeDistDir}/package.json\`"
export default canonicalConfig;
`;
  fs.writeFileSync(wrapperPath, wrapperSource);
}

export function ensureLegacyElectrobunCompatDir({
  legacyDir = legacyElectrobunDir,
  canonicalDir = canonicalElectrobunDir,
  canonicalConfigImportPath = "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
  copyEntry = symlinkOrCopy,
  copyScriptsDir = copyLegacyScriptsCompatDir,
  writeWrapper = writeLegacyElectrobunWrapper,
} = {}) {
  if (!fs.existsSync(canonicalDir)) {
    return false;
  }

  const wrapperPath = path.join(legacyDir, "electrobun.config.ts");
  const legacyDirExists = fs.existsSync(legacyDir);
  if (legacyDirExists && fs.existsSync(wrapperPath)) {
    return false;
  }

  const dirWasCreated = !legacyDirExists;
  fs.mkdirSync(legacyDir, { recursive: true });
  try {
    for (const entry of fs.readdirSync(canonicalDir, { withFileTypes: true })) {
      const sourcePath = path.join(canonicalDir, entry.name);
      const targetPath = path.join(legacyDir, entry.name);

      if (entry.name === "electrobun.config.ts") {
        continue;
      }

      // The scripts dir often already exists (because ensure-whisper-model.sh
      // is git-tracked under apps/app/electrobun/scripts/), but its other
      // wrapper files (hdiutil-wrapper.sh, xcrun-wrapper.sh, zip-wrapper.sh)
      // are NOT tracked and must be merged in. copyScriptsDir handles a
      // pre-existing target dir and skips already-present entries.
      if (entry.name === "scripts") {
        copyScriptsDir(sourcePath, targetPath);
        continue;
      }

      if (fs.existsSync(targetPath)) {
        continue;
      }

      copyEntry(sourcePath, targetPath);
    }

    // The build/ and artifacts/ dirs don't exist yet (electrobun creates
    // them during the build / artifact-staging steps), but
    // release-electrobun.yml hard-codes `apps/app/electrobun/build` and
    // `apps/app/electrobun/artifacts` in its post-build steps (find
    // Resources, sign-windows.ps1, MSIX, version.json injection,
    // stage-macos-release-artifacts.sh, upload-artifact globs).
    // Pre-create dangling symlinks so once electrobun writes to the
    // canonical paths, the legacy paths resolve correctly.
    for (const dirName of ["build", "artifacts"]) {
      const link = path.join(legacyDir, dirName);
      if (
        fs.existsSync(link) ||
        fs.lstatSync(link, { throwIfNoEntry: false })
      ) {
        continue;
      }
      const canonical = path.join(canonicalDir, dirName);
      fs.mkdirSync(canonical, { recursive: true });
      fs.symlinkSync(
        path.relative(legacyDir, canonical),
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
    }

    writeWrapper(
      path.join(legacyDir, "electrobun.config.ts"),
      canonicalConfigImportPath,
    );
    return true;
  } catch (error) {
    if (dirWasCreated) {
      fs.rmSync(legacyDir, { force: true, recursive: true });
    }
    throw error;
  }
}

export function cleanupLegacyElectrobunCompatDir(
  shouldCleanup,
  legacyDir = legacyElectrobunDir,
  {
    root = repoRoot,
    trackedRelativePaths = loadTrackedLegacyElectrobunPaths(root),
  } = {},
) {
  if (!shouldCleanup || !fs.existsSync(legacyDir)) {
    return;
  }

  const trackedPaths = new Set(
    trackedRelativePaths.map((relativePath) =>
      path.resolve(root, relativePath),
    ),
  );
  if (trackedPaths.size === 0) {
    fs.rmSync(legacyDir, { force: true, recursive: true });
    return;
  }

  pruneGeneratedLegacyElectrobunEntries(legacyDir, trackedPaths);
}

export function loadTrackedLegacyElectrobunPaths(root = repoRoot) {
  const result = spawnSync(
    "git",
    ["ls-files", "--", path.relative(root, legacyElectrobunDir)],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function pruneGeneratedLegacyElectrobunEntries(targetPath, trackedPaths) {
  const absolutePath = path.resolve(targetPath);
  if (trackedPaths.has(absolutePath)) {
    return;
  }

  const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stat) {
    return;
  }

  if (stat.isSymbolicLink()) {
    fs.unlinkSync(absolutePath);
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absolutePath)) {
      pruneGeneratedLegacyElectrobunEntries(
        path.join(absolutePath, entry),
        trackedPaths,
      );
    }
    if (fs.readdirSync(absolutePath).length === 0) {
      fs.rmdirSync(absolutePath);
    }
    return;
  }

  fs.rmSync(absolutePath, { force: true });
}

export function main() {
  let exitCode = 0;
  let createdCompatDir = false;
  const shouldRestoreElizaChanges = isElizaWorktreeClean();
  const initialElizaUntrackedFiles = shouldRestoreElizaChanges
    ? listElizaUntrackedFiles()
    : [];
  try {
    run("node", ["scripts/init-submodules.mjs"]);
    createdCompatDir = ensureLegacyElectrobunCompatDir();
    assertReleaseContractTestsExist();
    run("node", ["scripts/apply-eliza-ci-patches.mjs"]);

    run("bunx", [
      "vitest",
      "run",
      "--passWithNoTests",
      ...releaseContractTests,
    ]);
    run("bunx", [
      "vitest",
      "run",
      "--passWithNoTests",
      "eliza/packages/app-core/scripts/startup-integration-script-drift.test.ts",
    ]);

    // tsdown and release:check resolve repo-root-relative entries/config.
    run("bunx", ["tsdown", "--fail-on-warn", "false"]);
    fs.mkdirSync(path.join(repoRoot, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "dist", "package.json"),
      '{"type":"module"}\n',
    );
    run("node", ["--import", "tsx", "scripts/write-build-info.ts"]);
    run("node", ["scripts/generate-static-asset-manifest.mjs"], appCoreRoot);
    // Published-only CI runs against an upstream eliza checkout whose pack
    // fallback path still needs the generic npm->bun retry patch.
    run("node", ["scripts/patch-release-check-pack-fallback.mjs"]);
    run("bun", ["run", "release:check"]);
  } catch (err) {
    console.error(err.message ?? err);
    exitCode = 1;
  } finally {
    cleanupLegacyElectrobunCompatDir(createdCompatDir);
    restoreGeneratedElizaChanges(
      shouldRestoreElizaChanges,
      repoRoot,
      initialElizaUntrackedFiles,
    );
  }

  return exitCode;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  process.exit(main());
}
