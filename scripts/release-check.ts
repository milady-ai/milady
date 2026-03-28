#!/usr/bin/env -S node --import tsx

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PackFile = { path: string };
type PackResult = { files?: PackFile[] };

const requiredPaths = [
  "dist/index.js",
  "dist/entry.js",
  "dist/build-info.json",
  "scripts/run-repo-setup.mjs",
  "scripts/setup-eliza-workspace.mjs",
  "scripts/ensure-vision-deps.mjs",
];
const forbiddenPrefixes = ["dist/Milady.app/"];
const orchestratorPackageName = "@elizaos/plugin-agent-orchestrator";
const orchestratorBrokenLifecycleTarget = "./scripts/ensure-node-pty.mjs";
const autonomousServerPathCandidates = [
  "node_modules/@miladyai/agent/packages/agent/src/api/server.js",
  "packages/agent/src/api/server.ts",
] as const;
const autonomousElizaPathCandidates = [
  "node_modules/@miladyai/agent/packages/agent/src/runtime/eliza.js",
  "packages/agent/src/runtime/eliza.ts",
] as const;
const requiredWorkflowSnippets = [
  'BUN_VERSION: "1.3.9"',
  "workflow_call:",
  "name: Validate Release Inputs",
  "Manual branch dispatches must provide inputs.tag; refusing to derive a release tag from package.json.",
  "bun-version: $" + "{{ env.BUN_VERSION }}",
  "name: Regression matrix contract",
  "run: bun run test:regression-matrix:release",
  "name: Run heavy E2E regression suite",
  "run: bun run test:e2e:heavy",
  "name: Run cloud live regression suite",
  "run: bun run test:live:cloud",
  "name: Release readiness checks",
  "run: bun run release:check",
  "for attempt in 1 2 3; do",
  `bun install failed on attempt \${attempt}; retrying in 15 seconds`,
  "name: Ensure avatar assets",
  "node scripts/ensure-avatars.mjs",
  "name: Prepare Whisper model artifact",
  "bash apps/app/electrobun/scripts/ensure-whisper-model.sh base.en",
  "name: Upload Whisper model artifact",
  "name: whisper-model-base-en",
  "Install quiet macOS packaging wrappers",
  "apps/app/electrobun/scripts/hdiutil-wrapper.sh",
  "apps/app/electrobun/scripts/xcrun-wrapper.sh",
  "apps/app/electrobun/scripts/zip-wrapper.sh",
  "ELECTROBUN_REAL_HDIUTIL: /usr/bin/hdiutil",
  "ELECTROBUN_REAL_XCRUN: /usr/bin/xcrun",
  "ELECTROBUN_REAL_ZIP: /usr/bin/zip",
  "name: Download Whisper model artifact",
  "name: Seed Whisper model cache",
  "Stage desktop bundle inputs",
  "node scripts/desktop-build.mjs stage --variant=base --build-whisper",
  "Inject version.json into bundle (Windows)",
  "Inject version.json into bundle (macOS / Linux)",
  '"identifier":"com.miladyai.milady"',
  "Stage standard macOS release app",
  "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
  "retry_stapler_validate()",
  "Smoke test packaged macOS app",
  "SMOKE_DIAGNOSTICS_DIR:",
  "SKIP_BUILD=1",
  "bun run test:desktop:packaged",
  "Upload macOS smoke diagnostics",
  "wrapper-diagnostics.json",
  "Install Inno Setup 6.7.1",
  "Downloading Inno Setup 6.7.1...",
  "https://github.com/jrsoftware/issrc/releases/download/is-6_7_1/innosetup-6.7.1.exe",
  "Start-Process -FilePath $installer",
  "Extract Windows app bundle for Inno Setup",
  '$extractDir = "C:\\m"',
  "milady-dist/entry.js found",
  "Build Inno Setup installer",
  "packaging/inno/build-inno.ps1",
  '-BuildDir "C:\\m"',
  "Verify Windows public installer looks complete",
  'Get-ChildItem -Path "apps/app/electrobun/artifacts" -File -Filter "Milady-Setup-*.exe"',
  "$minimumBytes = 50MB",
  "apps/app/electrobun/artifacts/*.exe",
  "name: Prepare public canary Windows installer artifact",
  "needs.prepare.outputs.env == 'canary'",
  '$publicCanaryDir = Join-Path $artifactsDir "public-canary-installer"',
  "Expand-Archive -Path $canonicalInstallerZip.FullName -DestinationPath $publicCanaryDir -Force",
  "Prepared public canary installer artifact:",
  "name: Upload public canary installer artifact",
  "name: electrobun-$" + "{{ matrix.platform.artifact-name }}-public-installer",
  "path: apps/app/electrobun/artifacts/public-canary-installer/Milady-Setup-*.exe",
  "name: Collect public release files",
  '-name "Milady-Setup-*.exe.zip" -o \\',
  '-name "*Setup*.tar.gz" -o \\',
  "name: Collect update channel files",
  '-name "*.tar.zst" -o \\',
  '-name "*-update.json" \\',
  "DMG attach attempt $attempt/5 failed",
  "node scripts/desktop-build.mjs package --env=$" +
    "{{ needs.prepare.outputs.env }}",
  "MILADY_ELECTROBUN_NOTARIZE: 0",
  'MILADY_DISABLE_LOCAL_EMBEDDINGS: "1"',
  'MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER: "1"',
  "MILADY_TEST_WINDOWS_INSTALL_DIR: C:\\mi",
  "name: Run Windows clean installer proof",
  "verify-windows-installer-proof.ps1",
  "MILADY_TEST_WINDOWS_PROOF_INSTALL_DIR: C:\\mi-proof",
  "name: Upload Windows installer proof artifact",
  "path: apps/app/electrobun/artifacts/windows-installer-proof/**",
  "if: always() && matrix.platform.os == 'windows'",
  "ANTHROPIC_API_KEY: $" + "{{ secrets.ANTHROPIC_API_KEY }}",
];
const _requiredPatchedElectrobunCliSnippets = [
  "https://github.com/blackboardsh/electrobun.git",
  '"sparse-checkout", "set", "package"',
  'writeGitHubEnv("ELECTROBUN_RCEDIT_PACKAGE_JSON", resolvedRceditPackageJson);',
  'const overridePackageJson = process.env["ELECTROBUN_RCEDIT_PACKAGE_JSON"];',
  'const overrideEntry = overrideRequire.resolve("rcedit");',
  "--target=bun-windows-x64-baseline",
  "const installedBinPath = path.join(",
  "const installedCachePath = path.join(",
];

export function findMissingPatchedElectrobunCliSnippets(
  source: string,
): string[] {
  return _requiredPatchedElectrobunCliSnippets.filter(
    (snippet) => !source.includes(snippet),
  );
}

const forbiddenWorkflowSnippets = [
  ' -name "*.exe" -o \\',
  'bun install -g "rcedit@4.0.1"',
  "name: Cache Bun install",
  "path: ~/.bun/install/cache",
  "restore-keys: bun-electrobun-validate-",
  "restore-keys: bun-electrobun-$" +
    "{{ matrix.platform.artifact-name }}" +
    "-",
  "key: bun-electrobun-validate-$" + "{{ hashFiles('bun.lock') }}",
  "key: bun-electrobun-$" +
    "{{ matrix.platform.artifact-name }}" +
    "-$" +
    "{{ hashFiles('bun.lock') }}",
  `TAG="v$(node -p "require('./package.json').version")"`,
  "name: Ensure Windows rcedit binary is available for Electrobun",
  "name: Pre-extract electrobun native CLI on Windows",
  "https://api.github.com/repos/blackboardsh/electrobun/releases/tags/v$version",
  "electrobun CLI checksum mismatch",
  '$extractionBases = @("D:\\a\\electrobun\\electrobun\\package")',
];
const requiredElectrobunPrWorkflowSnippets = [
  "name: Validate Electrobun Release Workflow",
  "pull_request:",
  "branches: [main, develop]",
  "workflow_dispatch:",
  "permissions:",
  "contents: read",
  'BUN_VERSION: "1.3.9"',
  "name: Release Workflow Contract",
  "bun install --frozen-lockfile --ignore-scripts",
  "bun run postinstall",
  "bun run test:regression-matrix:release-contract",
  "bun run test:release:contract",
];
const forbiddenElectrobunPrWorkflowSnippets = [
  "uses: ./.github/workflows/release-electrobun.yml",
  "publish_release: false",
  "publish_docker: false",
  "draft: false",
  "secrets: inherit",
  "packages: write",
];
const requiredElectrobunConfigSnippets = [
  'postBuild: "scripts/postwrap-sign-runtime-macos.ts"',
  'postWrap: "scripts/postwrap-diagnostics.ts"',
  'process.env.MILADY_ELECTROBUN_NOTARIZE !== "0"',
  '"../../../plugins.json": "milady-dist/plugins.json"',
  '"../../../package.json": "milady-dist/package.json"',
];
const localPackHotspotPaths = [
  "dist/node_modules",
  "apps/app/dist/vrms",
  "apps/app/dist/animations",
];

type RootPackageJson = {
  bundleDependencies?: string[];
  bundledDependencies?: string[];
  dependencies?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
};
const cloudAgentTemplateReleaseDependencies = [
  "@elizaos/core",
  "@elizaos/plugin-elizacloud",
  "@elizaos/plugin-sql",
] as const;

/**
 * Returns true if the version specifier is an exact pinned version
 * (no range operators, no tags, no URLs).
 *
 * Accepted: "0.3.14", "1.0.0", "2.0.0-alpha.87"
 * Rejected: "^0.3.14", "~1.0.0", ">=1.0.0", "next", "latest", "*",
 *           "workspace:*", "npm:foo@1.0.0", "https://...", "git+..."
 */
export function isExactVersion(specifier: string): boolean {
  if (!specifier || specifier.length === 0) return false;
  // Reject range operators, tags, URLs, workspace protocol
  if (/^[~^>=<*]/.test(specifier)) return false;
  if (/^(workspace|npm|file|git\+|https?):/.test(specifier)) return false;
  // Must look like a semver: starts with a digit, contains only digits/dots/hyphens/alphanumeric
  return /^\d+\.\d+\.\d+/.test(specifier);
}

type DependencyPackageJson = {
  scripts?: Record<string, string>;
};

export function parseBunPackDryRunOutput(raw: string): PackResult[] {
  const files = raw
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1]?.trim())
    .filter((path): path is string => Boolean(path))
    .map((path) => ({ path }));

  return [{ files }];
}

export function isNpmOverrideConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const execError = error as Error & {
    stdout?: string;
    stderr?: string;
  };
  const combinedOutput = `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`;
  return combinedOutput.includes("EOVERRIDE");
}

function runPackDry(): PackResult[] {
  try {
    const raw = execSync("npm pack --dry-run --json --ignore-scripts", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 100,
    });
    return JSON.parse(raw) as PackResult[];
  } catch (error) {
    if (!isNpmOverrideConflictError(error)) {
      throw error;
    }

    const raw = execSync("bun pm pack --dry-run --ignore-scripts", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 100,
    });
    return parseBunPackDryRunOutput(raw);
  }
}

export function findLocalPackHotspots(
  candidates = localPackHotspotPaths,
  pathExists: (candidate: string) => boolean = existsSync,
): string[] {
  return candidates.filter((candidate) => pathExists(candidate));
}

export function shouldSkipExactPackDryRun(
  hotspots: string[],
  env = process.env,
): boolean {
  if (hotspots.length === 0) {
    return false;
  }

  if (env.CI || env.GITHUB_ACTIONS) {
    return false;
  }

  if (env.MILADY_FORCE_PACK_DRY_RUN === "1") {
    return false;
  }

  return true;
}

export function isPackPathCoveredByFilesList(
  packPath: string,
  filesList: string[],
): boolean {
  const normalizedPath = packPath.replaceAll("\\", "/");
  return filesList.some((entry) => {
    const normalizedEntry = entry.replaceAll("\\", "/").replace(/\/$/, "");
    return (
      normalizedPath === normalizedEntry ||
      normalizedPath.startsWith(`${normalizedEntry}/`)
    );
  });
}

export function bundlesDependency(
  pkg: RootPackageJson,
  dependencyName: string,
): boolean {
  const bundled = [
    ...(pkg.bundleDependencies ?? []),
    ...(pkg.bundledDependencies ?? []),
  ];
  return bundled.includes(dependencyName);
}

export function isExactVersionSpecifier(
  versionSpecifier: string | undefined,
): boolean {
  if (typeof versionSpecifier !== "string") {
    return false;
  }

  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    versionSpecifier,
  );
}

export function hasLifecycleScriptReferencingMissingFile(
  pkg: DependencyPackageJson,
  packageDir: string,
  scriptName: string,
  relativeTarget: string,
  pathExists: (candidate: string) => boolean = existsSync,
): boolean {
  const lifecycleCommand = pkg.scripts?.[scriptName];
  if (
    typeof lifecycleCommand !== "string" ||
    !lifecycleCommand.includes(relativeTarget)
  ) {
    return false;
  }

  return !pathExists(resolve(packageDir, relativeTarget));
}

export function findFloatingDependencySpecs(
  pkg: RootPackageJson,
  dependencyNames: readonly string[],
): Array<{ name: string; specifier: string }> {
  const dependencies = pkg.dependencies ?? {};

  return dependencyNames.flatMap((name) => {
    const specifier = dependencies[name];
    if (!isExactVersionSpecifier(specifier)) {
      return [{ name, specifier: specifier ?? "<missing>" }];
    }

    return [];
  });
}

function readExistingReleaseCheckFile(
  label: string,
  candidates: readonly string[],
): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  }

  console.error(`release-check: could not find ${label}. Checked:`);
  for (const candidate of candidates) {
    console.error(`  - ${candidate}`);
  }
  process.exit(1);
}

function runFastLocalPackCheck(hotspots: string[]) {
  console.warn(
    "release-check: skipping exact npm pack --dry-run because local desktop build artifacts are present and package.json whitelists broad build directories:",
  );
  for (const hotspot of hotspots) {
    console.warn(`  - ${hotspot}`);
  }
  console.warn(
    "release-check: package.json files includes 'dist' and 'apps/app/dist', so a local pack dry-run has to walk those trees. Set MILADY_FORCE_PACK_DRY_RUN=1 to run the exact pack check anyway.",
  );

  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  const includedFiles = rootPackage.files ?? [];
  const missing = requiredPaths.filter((path) => !existsSync(path));
  const uncovered = requiredPaths.filter(
    (path) => !isPackPathCoveredByFilesList(path, includedFiles),
  );
  const forbidden = forbiddenPrefixes.filter((prefix) =>
    existsSync(prefix.replace(/\/$/, "")),
  );

  if (missing.length > 0 || uncovered.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in publish roots:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (uncovered.length > 0) {
      console.error(
        "release-check: package.json files does not whitelist required publish files:",
      );
      for (const path of uncovered) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files present in publish roots:");
      for (const prefix of forbidden) {
        console.error(`  - ${prefix}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: local publish-root sanity check looks OK.");
}

function assertBundledAgentOrchestratorInstallFix() {
  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  if (!bundlesDependency(rootPackage, orchestratorPackageName)) {
    console.error(
      "release-check: package.json must bundle @elizaos/plugin-agent-orchestrator until the upstream tarball stops shipping a broken postinstall hook.",
    );
    process.exit(1);
  }

  const orchestratorVersion =
    rootPackage.dependencies?.[orchestratorPackageName];
  if (!isExactVersionSpecifier(orchestratorVersion)) {
    console.error(
      "release-check: package.json must pin @elizaos/plugin-agent-orchestrator to an exact version until the upstream tarball stops shipping a broken postinstall hook.",
    );
    process.exit(1);
  }

  const orchestratorPackageJsonPath = resolve(
    "node_modules",
    "@elizaos",
    "plugin-agent-orchestrator",
    "package.json",
  );
  if (!existsSync(orchestratorPackageJsonPath)) {
    console.error(
      "release-check: node_modules/@elizaos/plugin-agent-orchestrator/package.json is missing. Run bun install before publishing.",
    );
    process.exit(1);
  }

  const orchestratorPackage = JSON.parse(
    readFileSync(orchestratorPackageJsonPath, "utf8"),
  ) as DependencyPackageJson;
  if (
    hasLifecycleScriptReferencingMissingFile(
      orchestratorPackage,
      dirname(orchestratorPackageJsonPath),
      "postinstall",
      orchestratorBrokenLifecycleTarget,
    )
  ) {
    console.error(
      "release-check: @elizaos/plugin-agent-orchestrator still references missing scripts/ensure-node-pty.mjs. The pnpm patch should remove this postinstall script.",
    );
    process.exit(1);
  }
}
function assertOrchestratorVersionPinned() {
  const rootPackage = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as RootPackageJson;
  const version = rootPackage.dependencies?.[orchestratorPackageName];
  if (!version) {
    console.error(
      `release-check: ${orchestratorPackageName} is not in dependencies.`,
    );
    process.exit(1);
  }
  if (!isExactVersion(version)) {
    console.error(
      `release-check: ${orchestratorPackageName} must be pinned to an exact version (e.g. "0.3.14"), but found "${version}". Floating tags like "next" or ranges like "^0.3.14" are not allowed for release builds.`,
    );
    process.exit(1);
  }
}

function assertCloudAgentTemplateDependenciesPinned() {
  const cloudAgentPackage = JSON.parse(
    readFileSync("deploy/cloud-agent-template/package.json", "utf8"),
  ) as RootPackageJson;
  const floating = findFloatingDependencySpecs(
    cloudAgentPackage,
    cloudAgentTemplateReleaseDependencies,
  );

  if (floating.length > 0) {
    console.error(
      "release-check: deploy/cloud-agent-template/package.json must pin release dependencies to exact versions.",
    );
    for (const dependency of floating) {
      console.error(`  - ${dependency.name}: ${dependency.specifier}`);
    }
    process.exit(1);
  }
}

function assertReleaseWorkflowHasNotaryWrapper() {
  const workflow = readFileSync(
    ".github/workflows/release-electrobun.yml",
    "utf8",
  );
  const missing = requiredWorkflowSnippets.filter(
    (snippet) => !workflow.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: release workflow is missing notary wrapper wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbidden = forbiddenWorkflowSnippets.filter((snippet) =>
    workflow.includes(snippet),
  );

  if (forbidden.length > 0) {
    console.error(
      "release-check: release workflow still exposes raw bootstrap artifacts on the public GitHub release:",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertElectrobunPrWorkflowExists() {
  const workflow = readFileSync(
    ".github/workflows/test-electrobun-release.yml",
    "utf8",
  );
  const missing = requiredElectrobunPrWorkflowSnippets.filter(
    (snippet) => !workflow.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: Electrobun PR workflow is missing lightweight release-contract validation:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbidden = forbiddenElectrobunPrWorkflowSnippets.filter((snippet) =>
    workflow.includes(snippet),
  );

  if (forbidden.length > 0) {
    console.error(
      "release-check: Electrobun PR workflow still invokes the full reusable release pipeline:",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertElectrobunConfigHasPostWrapSigner() {
  const config = readFileSync(
    "apps/app/electrobun/electrobun.config.ts",
    "utf8",
  );
  const missing = requiredElectrobunConfigSnippets.filter(
    (snippet) => !config.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: electrobun config is missing postBuild signer wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertMacArtifactStagerLooksCorrect() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
    "utf8",
  );
  const requiredSnippets = [
    'find "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "*-macos-*.app.tar.zst"',
    "no macOS updater tarball found",
    'DIRECT_LAUNCHER_SOURCE="$SCRIPT_DIR/macos-direct-launcher.c"',
    'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    "/usr/bin/clang \\",
    'install -m 0755 "$TMP_LAUNCHER_PATH" "$LAUNCHER_PATH"',
    `--options runtime "\${entitlement_args[@]}" "$LAUNCHER_PATH"`,
    `--options runtime "\${entitlement_args[@]}" "$STAGED_APP_PATH"`,
    'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    "hdiutil create \\",
    "notarytool submit \\",
    'stapler staple "$TEMP_DMG_PATH"',
    'mv "$TEMP_DMG_PATH" "$FINAL_DMG_PATH"',
  ];
  const missing = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missing.length > 0) {
    console.error(
      "release-check: macOS artifact stager is missing required release wiring:",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  const forbiddenSnippets = [
    'codesign --force --deep --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$STAGED_APP_PATH"',
    "exit_code=$?",
  ];
  const forbidden = forbiddenSnippets.filter((snippet) =>
    script.includes(snippet),
  );

  if (forbidden.length > 0) {
    console.error(
      "release-check: macOS artifact stager still contains known-bad signing/retry logic:",
    );
    for (const snippet of forbidden) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertWindowsSmokeScriptHasLeadingParamBlock() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test-windows.ps1",
    "utf8",
  );
  const firstRelevantLine = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (firstRelevantLine !== "param(") {
    console.error(
      "release-check: smoke-test-windows.ps1 must start with a param() block before executable statements.",
    );
    console.error(`  - first relevant line: ${firstRelevantLine ?? "<none>"}`);
    process.exit(1);
  }

  const requiredSnippets = [
    "Find-Launcher $resolvedBuildDir",
    'Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*.tar.zst"',
    'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    '$requireInstaller = $env:MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER -eq "1"',
    "Installing via Inno Setup:",
    "/VERYSILENT",
    "installed Inno package",
    "$persistLauncherPathFile = $env:MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE",
    "Installer-required runs skip build/tarball reuse and validate the installed package directly.",
    "Using $launcherSource launcher:",
    "Using packaged tarball:",
    "Find-Launcher $selfExtractionRoot",
    "Started extracted launcher:",
    '$startupSessionId = "milady-windows-smoke-"',
    "$startupStateFile = Join-Path $env:RUNNER_TEMP",
    '$startupBootstrapFile = Join-Path $startupBundleRoot "startup-session.json"',
    "Write-StartupBootstrap",
    "if ($state.session_id -ne $startupSessionId)",
    "$handler.UseProxy = $false",
    '--noproxy "127.0.0.1"',
    "function Test-BackendProbeStatus",
    "Cleared stale startup log:",
    "Startup trace entered fatal phase:",
    "Latest startup trace state:",
    "-SkipHttpErrorCheck",
    "Dump-PortDiagnostics",
    "Dump-ProcessDiagnostics",
    "Dump-FailureDiagnostics",
    "periodic diagnostics at",
    "FAILURE DIAGNOSTICS",
  ];
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    console.error(
      "release-check: smoke-test-windows.ps1 is missing the packaged-launcher/dynamic-port smoke logic.",
    );
    for (const snippet of missingSnippets) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertWindowsInstallerProofScript() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/verify-windows-installer-proof.ps1",
    "utf8",
  );

  const requiredSnippets = [
    "Milady-Setup-*.exe",
    "smoke-test-windows.ps1",
    "MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER",
    "Start Menu",
    "unins*.exe",
    "proof-summary.json",
  ];
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    console.error(
      "release-check: verify-windows-installer-proof.ps1 is missing required clean-install proof logic.",
    );
    for (const snippet of missingSnippets) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertInnoBuildScriptHasTimeoutAndHeartbeat() {
  const script = readFileSync("packaging/inno/build-inno.ps1", "utf8");
  const requiredSnippets = [
    "$isccTimeout = [TimeSpan]::FromMinutes(25)",
    "$isccHeartbeatInterval = [TimeSpan]::FromSeconds(30)",
    "Write-Host \"Starting ISCC.exe: $isccPath $($isccArgumentDisplay -join ' ')\"",
    "Start-Process -FilePath $isccPath",
    'Write-Host "ISCC.exe still running after $([math]::Round($elapsed.TotalMinutes, 1)) minutes..."',
    "Stop-Process -Id $isccProcess.Id -Force",
    'throw "ISCC.exe timed out after $([int]$isccTimeout.TotalMinutes) minutes while building the Windows installer."',
  ];
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    console.error(
      "release-check: build-inno.ps1 must supervise ISCC.exe with heartbeat logging and a hard timeout.",
    );
    for (const snippet of missingSnippets) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertInnoTemplateTargetsBundledLauncher() {
  const template = readFileSync("packaging/inno/Milady.iss", "utf8");
  const requiredSnippets = [
    '#define MyAppExeName "bin\\launcher.exe"',
    'Filename: "{app}\\{#MyAppExeName}"',
  ];
  const missingSnippets = requiredSnippets.filter(
    (snippet) => !template.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    console.error(
      "release-check: Milady.iss must point Windows shortcuts and uninstall metadata at bin\\launcher.exe.",
    );
    for (const snippet of missingSnippets) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }

  if (template.includes('#define MyAppExeName "launcher.exe"')) {
    console.error(
      "release-check: Milady.iss must not point Windows shortcuts at {app}\\launcher.exe; the bundled launcher lives under bin\\.",
    );
    process.exit(1);
  }
}

function assertMacSmokeScriptLaunchesPackagedLauncherDirectly() {
  const script = readFileSync(
    "apps/app/electrobun/scripts/smoke-test.sh",
    "utf8",
  );

  if (
    !script.includes(
      'LAUNCHER_PATH="$LAUNCH_APP_BUNDLE/Contents/MacOS/launcher"',
    )
  ) {
    console.error(
      "release-check: smoke-test.sh must launch the packaged Contents/MacOS/launcher directly.",
    );
    process.exit(1);
  }

  const requiredSnippets = [
    "dump_failure_diagnostics()",
    "write_bundle_diagnostics()",
    "collect_recent_crash_reports()",
    "build_launcher_command()",
    "probe_macos_bundle_exec_support()",
    "launch_packaged_app_with_open()",
    'OPEN_LAUNCH_ATTEMPTED="1"',
    'STARTUP_BOOTSTRAP_FILE="$LAUNCH_APP_BUNDLE/Contents/Resources/startup-session.json"',
    "const [filePath, expectedSession] = process.argv.slice(1);",
    'TERM="$' + "{TERM:-dumb}" + '"',
    "attach_dmg_with_retry()",
    'MOUNT_POINT="$(attach_dmg_with_retry "$DMG_PATH")"',
    'DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"',
    'echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"',
    "assert_packaged_archive_asset()",
    'echo "Packaged renderer asset check PASSED (wrapper archive)."',
    'echo "Launcher: $' + "{LAUNCHER_PATH:-<unset>}" + '"',
    'local launcher_stdout="$' + "{LAUNCHER_STDOUT:-}" + '"',
    "backend_health_probe_satisfied()",
    '[[ "$status" == "200" || "$status" == "401" ]]',
    "Launcher exited before the first health probe; continuing to wait for packaged app handoff...",
    'dump_failure_diagnostics "open(1) failed to launch packaged app"',
    'FAILURE_REASON="open(1) launch produced no startup trace"',
    'FAILURE_REASON="macOS direct app-bundle exec probe returned SIGKILL (137) before startup trace began"',
  ];
  const missing = requiredSnippets.filter(
    (snippet) => !script.includes(snippet),
  );
  if (missing.length > 0) {
    console.error(
      "release-check: smoke-test.sh is missing failure-time diagnostics hooks.",
    );
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    process.exit(1);
  }
}

function assertServerDynamicHyperscapeImport() {
  const serverSource = readExistingReleaseCheckFile(
    "autonomous API server source",
    autonomousServerPathCandidates,
  );

  // @elizaos/app-hyperscape/routes must be a dynamic import (lazy) so the
  // API server can start without it. A static top-level import would crash
  // the server when the package is not installed (e.g. Windows smoke test).
  const lines = serverSource.split("\n");
  const staticImports = lines.filter(
    (line) =>
      /^\s*import\s/.test(line) && line.includes("@elizaos/app-hyperscape"),
  );
  if (staticImports.length > 0) {
    console.error(
      "release-check: server.ts must NOT have a static import of @elizaos/app-hyperscape/routes. Use a dynamic import inside a try-catch.",
    );
    for (const line of staticImports) {
      console.error(`  - ${line.trim()}`);
    }
    process.exit(1);
  }

  if (!serverSource.includes("@elizaos/app-hyperscape/routes")) {
    console.error(
      "release-check: server.ts must dynamically import @elizaos/app-hyperscape/routes.",
    );
    process.exit(1);
  }
}

function assertStartApiServerCatchBlockSafety() {
  const elizaSource = readExistingReleaseCheckFile(
    "autonomous runtime source",
    autonomousElizaPathCandidates,
  );

  // The catch block around startApiServer must use console.error so errors
  // are visible in packaged builds (Electrobun agent.ts reads stderr).
  if (!elizaSource.includes("console.error(apiErrMsg)")) {
    console.error(
      "release-check: eliza.ts startApiServer catch block must use console.error(apiErrMsg) so errors are visible in packaged builds.",
    );
    process.exit(1);
  }

  // In server-only mode, a failed API server must be fatal.
  const catchIndex = elizaSource.indexOf("catch (apiErr)");
  if (catchIndex === -1) {
    console.error(
      "release-check: eliza.ts must have a catch (apiErr) block around startApiServer.",
    );
    process.exit(1);
  }
  const catchBlock = elizaSource.slice(
    catchIndex,
    elizaSource.indexOf("// ── Server-only mode", catchIndex),
  );
  if (
    !catchBlock.includes("opts?.serverOnly") ||
    !catchBlock.includes("process.exit(1)")
  ) {
    console.error(
      "release-check: eliza.ts startApiServer catch block must call process.exit(1) when opts?.serverOnly is true.",
    );
    process.exit(1);
  }
}

function main() {
  assertReleaseWorkflowHasNotaryWrapper();
  assertElectrobunPrWorkflowExists();
  assertElectrobunConfigHasPostWrapSigner();
  assertMacArtifactStagerLooksCorrect();
  assertWindowsSmokeScriptHasLeadingParamBlock();
  assertWindowsInstallerProofScript();
  assertInnoBuildScriptHasTimeoutAndHeartbeat();
  assertInnoTemplateTargetsBundledLauncher();
  assertMacSmokeScriptLaunchesPackagedLauncherDirectly();
  assertServerDynamicHyperscapeImport();
  assertStartApiServerCatchBlockSafety();
  assertBundledAgentOrchestratorInstallFix();
  assertOrchestratorVersionPinned();
  assertCloudAgentTemplateDependenciesPinned();
  const localHotspots = findLocalPackHotspots();
  if (shouldSkipExactPackDryRun(localHotspots)) {
    runFastLocalPackCheck(localHotspots);
    return;
  }
  const results = runPackDry();
  const files = results.flatMap((entry) => entry.files ?? []);
  const paths = new Set(files.map((file) => file.path));

  const missing = requiredPaths.filter((path) => !paths.has(path));
  const forbidden = [...paths].filter((path) =>
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
  );

  if (missing.length > 0 || forbidden.length > 0) {
    if (missing.length > 0) {
      console.error("release-check: missing files in npm pack:");
      for (const path of missing) {
        console.error(`  - ${path}`);
      }
    }
    if (forbidden.length > 0) {
      console.error("release-check: forbidden files in npm pack:");
      for (const path of forbidden) {
        console.error(`  - ${path}`);
      }
    }
    process.exit(1);
  }

  console.log("release-check: npm pack contents look OK.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
