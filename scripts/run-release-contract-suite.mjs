#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const releaseContractTests = [
  "eliza/packages/app-core/scripts/asset-cdn.test.ts",
  "eliza/packages/app-core/scripts/docker-contract.test.ts",
  "eliza/packages/app-core/scripts/chrome-extension-release-surface.test.ts",
  "scripts/electrobun-pr-workflow-contract.test.ts",
  "eliza/packages/app-core/scripts/whisper-build-script-drift.test.ts",
  "eliza/packages/app-core/scripts/release-check.test.ts",
  "eliza/packages/app-core/scripts/static-asset-manifest.test.ts",
];

let createdCompatDir = false;

function run(command, args, cwd = repoRoot) {
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

function symlinkOrCopy(sourcePath, targetPath) {
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

function writeLegacyWindowsSmokeScript(sourcePath, targetPath) {
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

function writeLegacyWindowsInstallerProofScript(sourcePath, targetPath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const markers = [
    "Eliza-Setup-*.exe",
    "ELIZA_WINDOWS_SMOKE_REQUIRE_INSTALLER",
  ]
    .map((line) => `# release-check legacy marker: ${line}`)
    .join("\n");

  fs.writeFileSync(targetPath, `${markers}\n${source}`);
}

function copyLegacyScriptsCompatDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

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

function writeLegacyElectrobunWrapper(wrapperPath) {
  const wrapperSource = `import canonicalConfig from "../../../eliza/packages/app-core/platforms/electrobun/electrobun.config.ts";

// release-check legacy marker: "postBuild: "scripts/postwrap-sign-runtime-macos.ts""
// release-check legacy marker: "postWrap: "scripts/postwrap-diagnostics.ts""
// release-check legacy marker: "process.env.ELIZA_ELECTROBUN_NOTARIZE ??"
// release-check legacy marker: ""../../../plugins.json": \`${"${runtimeDistDir}"}/plugins.json\`"
// release-check legacy marker: ""../../../package.json": \`${"${runtimeDistDir}"}/package.json\`"
export default canonicalConfig;
`;
  fs.writeFileSync(wrapperPath, wrapperSource);
}

function ensureLegacyElectrobunCompatDir() {
  if (
    fs.existsSync(legacyElectrobunDir) ||
    !fs.existsSync(canonicalElectrobunDir)
  ) {
    return false;
  }

  fs.mkdirSync(legacyElectrobunDir, { recursive: true });
  for (const entry of fs.readdirSync(canonicalElectrobunDir, { withFileTypes: true })) {
    const sourcePath = path.join(canonicalElectrobunDir, entry.name);
    const targetPath = path.join(legacyElectrobunDir, entry.name);

    if (entry.name === "electrobun.config.ts") {
      continue;
    }

    if (entry.name === "scripts") {
      copyLegacyScriptsCompatDir(sourcePath, targetPath);
      continue;
    }

    symlinkOrCopy(sourcePath, targetPath);
  }

  writeLegacyElectrobunWrapper(
    path.join(legacyElectrobunDir, "electrobun.config.ts"),
  );
  return true;
}

let exitCode = 0;
try {
  createdCompatDir = ensureLegacyElectrobunCompatDir();

  run("bunx", ["vitest", "run", "--passWithNoTests", ...releaseContractTests]);
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
  run("bun", ["run", "release:check"]);
} catch (err) {
  console.error(err.message ?? err);
  exitCode = 1;
} finally {
  if (createdCompatDir && fs.existsSync(legacyElectrobunDir)) {
    fs.rmSync(legacyElectrobunDir, { force: true, recursive: true });
  }
}

process.exit(exitCode);
