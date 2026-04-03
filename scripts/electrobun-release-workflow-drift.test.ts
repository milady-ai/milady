import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

function resolveAgentFile(relativePath: string): string {
  const candidates = [
    // Workspace: direct source
    path.join(ROOT, "packages/agent/src", relativePath),
    // Workspace symlink with nested structure (local dev)
    path.join(
      ROOT,
      "node_modules/@miladyai/agent/packages/agent/src",
      relativePath,
    ),
    // Workspace symlink (CI)
    path.join(ROOT, "node_modules/@miladyai/agent/src", relativePath),
    // Published package (JS)
    path.join(
      ROOT,
      "node_modules/@miladyai/agent/packages/agent/src",
      relativePath.replace(/\.ts$/, ".js"),
    ),
    path.join(
      ROOT,
      "node_modules/@miladyai/agent/src",
      relativePath.replace(/\.ts$/, ".js"),
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // fallback — test will fail with useful error
}

const SERVER_TS_PATH = resolveAgentFile("api/server.ts");
const ELIZA_TS_PATH = resolveAgentFile("runtime/eliza.ts");
const WORKFLOW_PATH = path.join(
  ROOT,
  ".github/workflows/release-electrobun.yml",
);
const WINDOWS_SMOKE_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/smoke-test-windows.ps1",
);
const WINDOWS_INSTALLER_PROOF_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/verify-windows-installer-proof.ps1",
);
const MACOS_STAGE_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/stage-macos-release-artifacts.sh",
);
const MACOS_EFFECTS_BUILD_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/build-macos-effects.sh",
);
const MACOS_DIRECT_LAUNCHER_SOURCE_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/macos-direct-launcher.c",
);
const MACOS_SMOKE_SCRIPT_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/smoke-test.sh",
);
const WINDOWS_PACKAGED_TEST_PATH = path.join(
  ROOT,
  "apps/app/test/electrobun-packaged/electrobun-windows-startup.e2e.spec.ts",
);
const WINDOWS_PACKAGED_BOOTSTRAP_HELPER_PATH = path.join(
  ROOT,
  "apps/app/test/electrobun-packaged/windows-bootstrap.ts",
);
const WINDOWS_PACKAGED_ENV_HELPER_PATH = path.join(
  ROOT,
  "apps/app/test/electrobun-packaged/windows-test-env.ts",
);
const INNO_BUILD_SCRIPT_PATH = path.join(ROOT, "packaging/inno/build-inno.ps1");
const INNO_TEMPLATE_PATH = path.join(ROOT, "packaging/inno/Milady.iss");
const MSIX_BUILD_SCRIPT_PATH = path.join(ROOT, "packaging/msix/build-msix.ps1");
const ELECTROBUN_CONFIG_PATH = path.join(
  ROOT,
  "apps/app/electrobun/electrobun.config.ts",
);

describe("Electrobun release workflow drift", () => {
  it("uses the shared desktop-build script to stage bundle inputs before packaging", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Stage desktop bundle inputs");
    expect(workflow).toContain(
      "node scripts/desktop-build.mjs stage --variant=base --build-whisper",
    );
  });

  it("injects version.json into packaged bundles after the build step", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const buildIndex = workflow.indexOf("name: Build Electrobun app");
    const windowsIndex = workflow.indexOf(
      "name: Inject version.json into bundle (Windows)",
    );
    const unixIndex = workflow.indexOf(
      "name: Inject version.json into bundle (macOS / Linux)",
    );

    expect(buildIndex).toBeGreaterThan(-1);
    expect(windowsIndex).toBeGreaterThan(buildIndex);
    expect(unixIndex).toBeGreaterThan(buildIndex);
    expect(workflow).toContain('"identifier":"com.miladyai.milady"');
  });

  it("builds the Intel macOS artifact on the real Intel runner", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("- name: macOS (Intel)");
    expect(workflow).toContain("runner: macos-15-intel");
    expect(workflow).toContain("- name: Setup Node.js");
    expect(workflow).toContain("- name: Setup Bun");
    expect(workflow).toContain(
      "arch -x86_64 bun install --frozen-lockfile --ignore-scripts",
    );
    expect(workflow).toContain(
      'MILADY_DESKTOP_COMMAND_PREFIX="arch -x86_64" node scripts/desktop-build.mjs stage --variant=base --build-whisper',
    );
    expect(workflow).toContain(
      'MILADY_DESKTOP_COMMAND_PREFIX="arch -x86_64" node scripts/desktop-build.mjs package --env=$' +
        "{{ needs.prepare.outputs.env }}",
    );
    expect(workflow).not.toContain("arch -x86_64 bun install --ignore-scripts");
    expect(workflow).not.toContain(
      "name: Setup Node.js (macOS Intel via Rosetta)",
    );
    expect(workflow).not.toContain("name: Setup Bun (macOS Intel via Rosetta)");
    expect(workflow).not.toContain("bun-darwin-x64.zip");
  });

  it("pins Bun and runs release-check before the desktop matrix", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const validateJobIndex = workflow.indexOf("name: Validate Release Inputs");
    const buildJobIndex = workflow.indexOf(
      "name: Build $" + "{{ matrix.platform.name }}",
    );
    const releaseCheckIndex = workflow.indexOf("run: bun run release:check");

    expect(workflow).toContain('BUN_VERSION: "1.3.9"');
    expect(workflow).toContain('NODE_NO_WARNINGS: "1"');
    expect(workflow).toContain("bun-version: $" + "{{ env.BUN_VERSION }}");
    expect(workflow).not.toContain("bun-version: latest");
    expect(validateJobIndex).toBeGreaterThan(-1);
    expect(buildJobIndex).toBeGreaterThan(validateJobIndex);
    expect(releaseCheckIndex).toBeGreaterThan(validateJobIndex);
    expect(workflow).toContain("needs: [prepare, validate-release]");
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      "runs-on: ${{ vars.RUNNER_UBUNTU || (github.repository_owner == 'milady-ai' && 'blacksmith-4vcpu-ubuntu-2404' || 'ubuntu-latest') }}",
    );
  });

  it("runs the release regression contract before release-check", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const regressionIndex = workflow.indexOf(
      "run: bun run test:regression-matrix:release",
    );
    const heavyE2EIndex = workflow.indexOf("run: bun run test:e2e:heavy");
    const liveCloudIndex = workflow.indexOf("run: bun run test:live:cloud");
    const restoreBuildInfoIndex = workflow.indexOf(
      "name: Restore build metadata after test rebuilds",
    );
    const releaseCheckIndex = workflow.indexOf("run: bun run release:check");

    expect(regressionIndex).toBeGreaterThan(-1);
    expect(heavyE2EIndex).toBeGreaterThan(regressionIndex);
    expect(liveCloudIndex).toBeGreaterThan(heavyE2EIndex);
    expect(restoreBuildInfoIndex).toBeGreaterThan(liveCloudIndex);
    expect(releaseCheckIndex).toBeGreaterThan(restoreBuildInfoIndex);
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      "MILADY_RELEASE_TAG: ${{ needs.prepare.outputs.tag }}",
    );
    expect(workflow).toContain('MILADY_VALIDATE_CDN: "1"');
  });

  it("requires an explicit tag for manual non-tag runs", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
    expect(workflow).toContain('if [[ -n "${{ inputs.tag }}" ]]; then');
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      'elif [[ "${{ github.ref_type }}" == "tag" ]]; then',
    );
    expect(workflow).toContain(
      "Manual branch dispatches must provide inputs.tag; refusing to derive a release tag from package.json.",
    );
    expect(workflow).not.toContain(
      `TAG="v$(node -p "require('./package.json').version")"`,
    );
  });

  it("retries bun install before failing the desktop build matrix", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("for attempt in 1 2 3; do");
    expect(workflow).toContain(
      `bun install failed on attempt \${attempt}; retrying in 15 seconds`,
    );
    expect(workflow).toContain(`bun install failed after \${attempt} attempts`);
  });

  it("prepares one shared whisper model artifact before desktop staging", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const prepareModelIndex = workflow.indexOf(
      "name: Prepare Whisper model artifact",
    );
    const uploadModelIndex = workflow.indexOf(
      "name: Upload Whisper model artifact",
    );
    const downloadModelIndex = workflow.indexOf(
      "name: Download Whisper model artifact",
    );
    const seedModelIndex = workflow.indexOf("name: Seed Whisper model cache");
    const stageIndex = workflow.indexOf("name: Stage desktop bundle inputs");

    expect(prepareModelIndex).toBeGreaterThan(-1);
    expect(uploadModelIndex).toBeGreaterThan(prepareModelIndex);
    expect(downloadModelIndex).toBeGreaterThan(-1);
    expect(seedModelIndex).toBeGreaterThan(downloadModelIndex);
    expect(stageIndex).toBeGreaterThan(seedModelIndex);
    expect(workflow).toContain(
      "bash apps/app/electrobun/scripts/ensure-whisper-model.sh base.en",
    );
    expect(workflow).toContain("name: whisper-model-base-en");
    expect(workflow).toContain(
      'cp "$HOME/.cache/milady/whisper/ggml-base.en.bin"',
    );
  });

  it("does not restore Bun install cache during desktop builds", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const buildJobLabel = "name: Build $" + "{{ matrix.platform.name }}";
    const buildSection = workflow.slice(
      workflow.indexOf(buildJobLabel),
      workflow.indexOf("  create-release:"),
    );

    expect(buildSection).not.toContain("name: Cache Bun install");
    expect(buildSection).not.toContain("path: ~/.bun/install/cache");
    expect(buildSection).not.toContain("bun-electrobun-");
  });

  it("installs Inno Setup on Windows without relying on winget", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("Downloading Inno Setup 6.7.1...");
    expect(workflow).toContain(
      "https://github.com/jrsoftware/issrc/releases/download/is-6_7_1/innosetup-6.7.1.exe",
    );
    expect(workflow).toContain("Start-Process -FilePath $installer");
    expect(workflow).toContain("MILADY_INNO_SETUP_COMPILER=$iscc");
    expect(workflow).not.toContain(
      "winget install --exact --id JRSoftware.InnoSetup",
    );
  });

  it("does not restore Bun install cache in validate-release", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const validateSection = workflow.slice(
      workflow.indexOf("name: Validate Release Inputs"),
      workflow.indexOf("  build:"),
    );

    expect(validateSection).not.toContain("name: Cache Bun install");
    expect(validateSection).not.toContain("path: ~/.bun/install/cache");
    expect(validateSection).not.toContain("bun-electrobun-validate-");
    expect(validateSection).not.toContain("matrix.platform.artifact-name");
  });

  it("builds a patched Windows electrobun CLI instead of relying on temp extraction heuristics", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Resolve electrobun package dir");
    expect(workflow).toContain("id: resolve-electrobun");
    expect(workflow).toContain(
      'const workspacePackageJson = path.resolve("apps/app/electrobun/package.json");',
    );
    expect(workflow).toContain('const entryPath = req.resolve("electrobun");');
    expect(workflow).toContain(
      "Could not find electrobun package.json starting from",
    );
    expect(workflow).toContain("Resolved unexpected package at");
    expect(workflow).toContain(
      'echo "package-dir=$package_dir" >> "$GITHUB_OUTPUT"',
    );
    expect(workflow).toContain(
      'echo "cache-dir=$package_dir/.cache" >> "$GITHUB_OUTPUT"',
    );
    expect(workflow).toContain(
      "name: Build patched Electrobun CLI for Windows",
    );
    expect(workflow).toContain(
      'node scripts/build-patched-electrobun-cli.mjs "$' +
        '{{ steps.resolve-electrobun.outputs.package-dir }}"',
    );
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      "runner: ${{ vars.RUNNER_WINDOWS || (github.repository_owner == 'milady-ai' && 'blacksmith-4vcpu-windows-2025' || 'windows-2025') }}",
    );
    expect(workflow).not.toContain(
      'Join-Path $PWD "apps/app/electrobun/node_modules/electrobun"',
    );
    expect(workflow).not.toContain(
      "name: Ensure Windows rcedit binary is available for Electrobun",
    );
    expect(workflow).not.toContain(
      "name: Pre-extract electrobun native CLI on Windows",
    );
    expect(workflow).not.toContain(
      "https://api.github.com/repos/blackboardsh/electrobun/releases/tags/v$version",
    );
    expect(workflow).not.toContain("electrobun CLI checksum mismatch");
    expect(workflow).not.toContain(
      '$extractionBases = @("D:\\a\\electrobun\\electrobun\\package")',
    );
  });

  it("treats auth-protected health probes as valid smoke-test success on every desktop platform", () => {
    const windowsScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");
    const macScript = fs.readFileSync(MACOS_SMOKE_SCRIPT_PATH, "utf8");

    expect(windowsScript).toContain("function Test-BackendProbeStatus");
    expect(windowsScript).toContain(
      "return $StatusCode -eq 200 -or $StatusCode -eq 401",
    );
    expect(windowsScript).toContain("-SkipHttpErrorCheck");

    expect(macScript).toContain("backend_health_probe_satisfied()");
    expect(macScript).toContain(
      '[[ "$status" == "200" || "$status" == "401" ]]',
    );
  });

  it("stages the desktop bundle before restoring local electrobun caches", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const stageIndex = workflow.indexOf("name: Stage desktop bundle inputs");
    const cacheIndex = workflow.indexOf(
      "name: Cache local electrobun core downloads",
    );

    expect(stageIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeGreaterThan(stageIndex);
    expect(cacheIndex).toBeGreaterThan(
      workflow.indexOf("name: Resolve electrobun package dir"),
    );
    expect(workflow).toContain("name: Cache local electrobun core downloads");
    expect(workflow).toContain(
      "path: $" + "{{ steps.resolve-electrobun.outputs.cache-dir }}",
    );
    expect(workflow).not.toContain(
      "path: apps/app/electrobun/node_modules/electrobun/.cache",
    );
    expect(workflow).not.toContain(
      "name: Materialize local electrobun package for build",
    );
    expect(workflow).not.toContain(
      'bun install -g "electrobun@$ELECTROBUN_VERSION"',
    );
  });

  it("caches whisper models for release builds and avoids workflow-local staging drift", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Cache Whisper models and binaries");
    expect(workflow).toContain("~/.cache/milady/whisper");
    expect(workflow).toContain(
      "restore-keys: whisper-$" + "{{ matrix.platform.artifact-name }}-",
    );
    expect(workflow).toContain("name: Stage desktop bundle inputs");
    expect(workflow).toContain(
      "apps/app/electrobun/scripts/hdiutil-wrapper.sh",
    );
    expect(workflow).toContain("ELECTROBUN_REAL_HDIUTIL: /usr/bin/hdiutil");
  });

  it("keeps updater transport files off the public GitHub release asset list", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Collect public release files");
    expect(workflow).toContain(' -name "*.dmg" -o \\');
    expect(workflow).toContain(' -name "Milady-Setup-*.exe" -o \\');
    expect(workflow).toContain(' -name "Milady-Setup-*.exe.zip" -o \\');
    expect(workflow).toContain(' -name "*Setup*.tar.gz" -o \\');
    expect(workflow).toContain(' -name "*.msix" \\');
    expect(workflow).not.toContain(' -name "*.exe" -o \\');

    expect(workflow).toContain("name: Collect update channel files");
    expect(workflow).toContain(' -name "*.tar.zst" -o \\');
    expect(workflow).toContain(' -name "*.patch" -o \\');
    expect(workflow).toContain(' -name "*-update.json" \\');
    expect(workflow).toContain("files: release-files/*");
    expect(workflow).toContain("update-channel/");
  });

  it("installs Inno Setup 6.7.1 and builds a standalone Windows installer", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const patchedCliIndex = workflow.indexOf(
      "name: Build patched Electrobun CLI for Windows",
    );
    const installIndex = workflow.lastIndexOf("name: Install Inno Setup 6.7.1");
    const extractIndex = workflow.indexOf(
      "name: Extract Windows app bundle for Inno Setup",
    );
    const signIndex = workflow.indexOf("name: Sign Windows executables");
    const buildIndex = workflow.indexOf("name: Build Inno Setup installer");

    expect(workflow).toContain("name: Install Inno Setup 6.7.1");
    expect(workflow).toContain("Downloading Inno Setup 6.7.1...");
    expect(workflow).toContain(
      "https://github.com/jrsoftware/issrc/releases/download/is-6_7_1/innosetup-6.7.1.exe",
    );
    expect(workflow).toContain("name: Build Inno Setup installer");
    expect(workflow).toContain("packaging/inno/build-inno.ps1");
    expect(patchedCliIndex).toBeGreaterThan(-1);
    expect(signIndex).toBeGreaterThan(patchedCliIndex);
    expect(installIndex).toBeGreaterThan(signIndex);
    expect(extractIndex).toBeGreaterThan(installIndex);
    expect(buildIndex).toBeGreaterThan(extractIndex);
    expect(workflow).toContain('$extractDir = "C:\\m"');
    expect(workflow).toContain("milady-dist/entry.js found");
    expect(workflow).toContain('-BuildDir "C:\\m"');
    expect(workflow).toContain("MILADY_TEST_WINDOWS_INSTALL_DIR: C:\\mi");
    expect(workflow).toContain(
      "name: Verify Windows public installer looks complete",
    );
    expect(workflow).toContain(
      'Get-ChildItem -Path "apps/app/electrobun/artifacts" -File -Filter "Milady-Setup-*.exe"',
    );
    expect(workflow).toContain("$minimumBytes = 50MB");
  });

  it("prevents setup stub overwrite and re-verifies public installer size before upload", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const stageIndex = workflow.indexOf(
      "name: Stage Windows setup executables",
    );
    const reverifyIndex = workflow.indexOf(
      "name: Re-verify Windows public installer before upload",
    );

    expect(stageIndex).toBeGreaterThan(-1);
    expect(reverifyIndex).toBeGreaterThan(stageIndex);
    expect(workflow).toContain("$publicInstaller.Length -ge 50MB");
    expect(workflow).toContain(
      "$setupExecutable.Length -lt $publicInstaller.Length",
    );
    expect(workflow).toContain(
      "Skipping build setup stub that would overwrite verified public installer",
    );
    expect(workflow).toContain("$minimumBytes = 50MB");
    expect(workflow).toContain(
      "Public Windows installer regressed below standalone size threshold",
    );
  });

  it("normalizes the Windows launcher path back to the app root before packaging with Inno", () => {
    const script = fs.readFileSync(INNO_BUILD_SCRIPT_PATH, "utf8");

    expect(script).toContain(
      "# launcher.exe lives under bin/ in the Electrobun app bundle; the app root is one level up",
    );
    expect(script).toContain(
      'if ((Split-Path -Leaf $launcherParent) -eq "bin") {',
    );
    expect(script).toContain("Split-Path -Parent $launcherParent");
    expect(script).toContain(
      'Join-Path $sourceDir "Resources\\app\\milady-dist\\entry.js"',
    );
    expect(script).toContain("Resolve-Path $sourceDir");
  });

  it("points Windows installer shortcuts at the bundled bin launcher", () => {
    const template = fs.readFileSync(INNO_TEMPLATE_PATH, "utf8");

    expect(template).toContain('#define MyAppExeName "bin\\launcher.exe"');
    expect(template).toContain('#define MyAppIconFile "Milady.ico"');
    expect(template).toContain(
      'Source: "{#MySetupIconFile}"; DestDir: "{app}"; DestName: "{#MyAppIconFile}"; Flags: ignoreversion',
    );
    expect(template).toContain("UninstallDisplayIcon={app}\\{#MyAppIconFile}");
    expect(template).toContain(
      'Name: "{autoprograms}\\{#MyDefaultGroupName}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"; IconFilename: "{app}\\{#MyAppIconFile}"',
    );
    expect(template).toContain(
      'Name: "{autodesktop}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\\{#MyAppIconFile}"',
    );
    expect(template).not.toContain('#define MyAppExeName "launcher.exe"');
  });

  it("normalizes the Windows launcher path back to the app root before packaging with MSIX", () => {
    const script = fs.readFileSync(MSIX_BUILD_SCRIPT_PATH, "utf8");

    expect(script).toContain(
      "# launcher.exe lives under bin/ in the Electrobun app bundle; the app root is one level up",
    );
    expect(script).toContain(
      'if ((Split-Path -Leaf $launcherParent) -eq "bin") {',
    );
    expect(script).toContain("Split-Path -Parent $launcherParent");
  });

  it("bounds hung Inno compiler runs with heartbeat logging and a hard timeout", () => {
    const script = fs.readFileSync(INNO_BUILD_SCRIPT_PATH, "utf8");

    expect(script).toContain("$isccTimeout = [TimeSpan]::FromMinutes(25)");
    expect(script).toContain(
      "$isccHeartbeatInterval = [TimeSpan]::FromSeconds(30)",
    );
    expect(script).toContain(
      "Write-Host \"Starting ISCC.exe: $isccPath $($isccArgumentDisplay -join ' ')\"",
    );
    expect(script).toContain("Start-Process -FilePath $isccPath");
    expect(script).toContain(
      'Write-Host "ISCC.exe still running after $([math]::Round($elapsed.TotalMinutes, 1)) minutes..."',
    );
    expect(script).toContain("Stop-Process -Id $isccProcess.Id -Force");
    expect(script).toContain(
      'throw "ISCC.exe timed out after $([int]$isccTimeout.TotalMinutes) minutes while building the Windows installer."',
    );
  });

  it("treats the staged macOS app as an intermediate signed bundle, not a notarized final artifact", () => {
    const stageScript = fs.readFileSync(MACOS_STAGE_SCRIPT_PATH, "utf8");

    expect(stageScript).toContain(
      "electrobun. Re-sign only what changed and keep the original entitlements",
    );
    expect(stageScript).toContain(
      'codesign -d --entitlements :- "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain(
      `--options runtime "\${entitlement_args[@]}" "$LAUNCHER_PATH"`,
    );
    expect(stageScript).toContain(
      `--options runtime "\${entitlement_args[@]}" "$STAGED_APP_PATH"`,
    );
    expect(stageScript).toContain(
      'codesign --verify --deep --strict --verbose=2 "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain("command_status=$?");
    expect(stageScript).not.toContain(
      'codesign --force --deep --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$STAGED_APP_PATH"',
    );
    expect(stageScript).not.toContain(
      'spctl -a -vv --type exec "$STAGED_APP_PATH"',
    );
    expect(stageScript).toContain(
      `REAL_XCRUN="\${ELECTROBUN_REAL_XCRUN:-/usr/bin/xcrun}"`,
    );
    expect(stageScript).toContain("wait_for_notary_acceptance()");
    expect(stageScript).toContain('"$REAL_XCRUN" notarytool submit \\');
    expect(stageScript).toContain(
      'NOTARY_SUBMISSION_ID="$(parse_notary_submission_id "$NOTARY_SUBMIT_OUTPUT_PATH" || true)"',
    );
    expect(stageScript).toContain('"$REAL_XCRUN" notarytool info \\');
    expect(stageScript).toContain('"$REAL_XCRUN" notarytool log \\');
    expect(stageScript).toContain('xcrun stapler staple "$TEMP_DMG_PATH"');
    expect(stageScript).not.toContain("--wait \\");
  });

  it("treats staged app Gatekeeper checks as advisory and keeps the notarized DMG as the hard release gate", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain('if ! spctl -a -vv --type exec "$app"; then');
    expect(workflow).toContain(
      "Gatekeeper rejected staged app bundle $app; continuing because the notarized DMG is the release artifact.",
    );
    expect(workflow).toContain('retry_stapler_validate "$dmg"');
    expect(workflow).toContain("Smoke test packaged macOS app");
  });

  it("rebuilds the staged macOS direct launcher with the packaged launcher architecture", () => {
    const stageScript = fs.readFileSync(MACOS_STAGE_SCRIPT_PATH, "utf8");

    expect(stageScript).toContain(
      'LAUNCHER_ARCHES="$(lipo -archs "$LAUNCHER_PATH" 2>/dev/null || true)"',
    );
    expect(stageScript).toContain("clang_arch_args=()");
    expect(stageScript).toContain('clang_arch_args+=(-arch "$arch")');
    expect(stageScript).toContain(
      'echo "stage-macos-release-artifacts: unsupported launcher architecture: $arch"',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable expansion in shell script assertion
    expect(stageScript).toContain('"${clang_arch_args[@]}"');
  });

  it("pins the native macOS effects build to C++17", () => {
    const buildScript = fs.readFileSync(
      MACOS_EFFECTS_BUILD_SCRIPT_PATH,
      "utf8",
    );

    expect(buildScript).toContain("-std=c++17");
  });

  it("validates renderer assets from the wrapped macOS runtime archive before launch", () => {
    const smokeScript = fs.readFileSync(MACOS_SMOKE_SCRIPT_PATH, "utf8");

    expect(smokeScript).toContain("assert_packaged_archive_asset()");
    expect(smokeScript).toContain("while IFS= read -r startup_state_line; do");
    expect(smokeScript).not.toContain("mapfile -t startup_state_parts");
    expect(smokeScript).toContain(
      'echo "Packaged renderer asset check PASSED (wrapper archive)."',
    );
    expect(smokeScript).toContain(
      'echo "Launcher: $' + "{LAUNCHER_PATH:-<unset>}" + '"',
    );
    expect(smokeScript).toContain(
      'local launcher_stdout="$' + "{LAUNCHER_STDOUT:-}" + '"',
    );
  });

  it("launches the staged macOS app via absolute bun and main.js paths", () => {
    const launcherSource = fs.readFileSync(
      MACOS_DIRECT_LAUNCHER_SOURCE_PATH,
      "utf8",
    );

    expect(launcherSource).toContain('"%s/bun"');
    expect(launcherSource).toContain('"%s/../Resources/main.js"');
    expect(launcherSource).not.toContain(
      '{"./bun", "../Resources/main.js", NULL}',
    );
  });

  it("includes heavy failure diagnostics in the Windows smoke test", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain("Dump-PortDiagnostics");
    expect(smokeScript).toContain("Dump-ProcessDiagnostics");
    expect(smokeScript).toContain("Dump-FailureDiagnostics");
    expect(smokeScript).toContain("periodic diagnostics at");
    expect(smokeScript).toContain("FAILURE DIAGNOSTICS");
    expect(smokeScript).toContain("netstat -ano");
    expect(smokeScript).toContain("netsh advfirewall firewall");
    expect(smokeScript).toContain("ANTHROPIC_API_KEY");
  });

  it("resets stale Windows startup logs and uses session-scoped startup trace files", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain("Cleared stale startup log:");
    expect(smokeScript).toContain(
      '$startupSessionId = "milady-windows-smoke-"',
    );
    expect(smokeScript).toContain(
      "$startupStateFile = Join-Path $env:RUNNER_TEMP",
    );
    expect(smokeScript).toContain(
      '$startupBootstrapFile = Join-Path $startupBundleRoot "startup-session.json"',
    );
    expect(smokeScript).toContain("Write-StartupBootstrap");
    expect(smokeScript).toContain(
      "if ($state.session_id -ne $startupSessionId)",
    );
  });

  it("bundles plugins.json and package.json into milady-dist for packaged builds", () => {
    const config = fs.readFileSync(ELECTROBUN_CONFIG_PATH, "utf8");

    // plugins.json must be copied so discoverPluginsFromManifest() can find it
    expect(config).toContain(
      '"../../../plugins.json": "milady-dist/plugins.json"',
    );
    // package.json must be copied so findOwnPackageRoot() can match on package name
    expect(config).toContain(
      '"../../../package.json": "milady-dist/package.json"',
    );
  });

  it("reads the Windows packaged startup log from %APPDATA%", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain(
      'Join-Path $env:APPDATA "Milady\\\\milady-startup.log"',
    );
    expect(smokeScript).not.toContain(
      'Join-Path $env:USERPROFILE ".config\\\\Milady\\\\milady-startup.log"',
    );
  });

  it("can force installer-first Windows smoke validation and persists the launched binary for UI tests", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(smokeScript).toContain("Find-Launcher $resolvedBuildDir");
    expect(smokeScript).toContain(
      '$requireInstaller = $env:MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER -eq "1"',
    );
    expect(smokeScript).toContain("Installing via Inno Setup:");
    expect(smokeScript).toContain("/VERYSILENT");
    expect(smokeScript).toContain("installed Inno package");
    expect(smokeScript).toContain(
      'Write-Host "Using $launcherSource launcher:',
    );
    expect(smokeScript).toContain(
      "Installer-required runs skip build/tarball reuse and validate the installed package directly.",
    );
    expect(smokeScript).toContain(
      "$persistLauncherPathFile = $env:MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE",
    );
    expect(smokeScript).toContain("Set-Content -Path $persistLauncherPathFile");
    expect(smokeScript).toContain(
      "$stopProtectedProcessIds = [System.Collections.Generic.HashSet[int]]::new()",
    );
    expect(smokeScript).toContain(
      'Get-CimInstance Win32_Process -Filter "ProcessId = $PID"',
    );
    expect(smokeScript).toContain(
      "-not $stopProtectedProcessIds.Contains([int]$_.Id)",
    );
    expect(smokeScript).toContain(
      "[int]::TryParse([string]$state.port, [ref]$observedPort)",
    );
    const tarballBranchIndex = smokeScript.indexOf(
      'Get-ChildItem -Path $resolvedArtifactsDir -File -Filter "*.tar.zst"',
    );
    const installerFallbackIndex = smokeScript.indexOf(
      "if (-not $launcher) {",
      tarballBranchIndex,
    );
    const installerLaunchIndex = smokeScript.indexOf(
      'Write-Host "Installing via Inno Setup: $($installer.FullName)"',
    );
    expect(tarballBranchIndex).toBeGreaterThan(-1);
    expect(installerFallbackIndex).toBeGreaterThan(tarballBranchIndex);
    expect(installerLaunchIndex).toBeGreaterThan(installerFallbackIndex);
    expect(workflow).toContain(
      "MILADY_TEST_WINDOWS_LAUNCHER_PATH_FILE: $" +
        "{{ runner.temp }}\\milady-windows-ui-launcher.txt",
    );
    // agent.ts sets MILADY_DISABLE_LOCAL_EMBEDDINGS=1 on Windows automatically;
    // the workflow also sets it so the entire process tree inherits it.
    expect(workflow).toContain('MILADY_DISABLE_LOCAL_EMBEDDINGS: "1"');
    expect(workflow).toContain('MILADY_WINDOWS_SMOKE_REQUIRE_INSTALLER: "1"');
    expect(workflow).toContain("MILADY_TEST_WINDOWS_INSTALL_DIR: C:\\mi");
    expect(workflow).toContain(
      'Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LAUNCHER_PATH=$launcherPath"',
    );
    expect(workflow).toContain(
      'Write-Error "Packaged Windows smoke test exited with code $LASTEXITCODE."',
    );
  });

  it("passes ANTHROPIC_API_KEY to the Windows smoke test for full runtime init", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "ANTHROPIC_API_KEY: $" + "{{ secrets.ANTHROPIC_API_KEY }}",
    );
  });

  it("collects Windows smoke diagnostics from runner environment paths before upload", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Collect Windows smoke diagnostics");
    expect(workflow).toContain("name: Upload Windows smoke diagnostics");
    expect(workflow).toContain("$env:MILADY_TEST_WINDOWS_APPDATA_PATH");
    expect(workflow).toContain("$env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH");
    expect(workflow).toContain(
      'Join-Path $appDataRoot "Milady\\\\milady-startup.log"',
    );
    expect(workflow).toContain(
      'Join-Path $localAppDataRoot "com.miladyai.milady"',
    );
    expect(workflow).toContain(
      "path: apps/app/electrobun/artifacts/windows-smoke-diagnostics/**",
    );
    expect(workflow).not.toContain("env.USERPROFILE }}\\.config\\Milady");
  });

  it("isolates Windows smoke runs from the runner's stable profile and exports the chosen backend port", () => {
    const smokeScript = fs.readFileSync(WINDOWS_SMOKE_PATH, "utf8");

    expect(smokeScript).toContain("MILADY_TEST_WINDOWS_APPDATA_PATH");
    expect(smokeScript).toContain("MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH");
    expect(smokeScript).toContain("$env:APPDATA = $testAppDataRoot");
    expect(smokeScript).toContain("$env:LOCALAPPDATA = $testLocalAppDataRoot");
    expect(smokeScript).toContain(
      'Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"',
    );
    expect(smokeScript).toContain(
      'Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"',
    );
    expect(smokeScript).toContain(
      '$selfExtractionRoot = Join-Path $env:LOCALAPPDATA "com.miladyai.milady"',
    );
    expect(smokeScript).toContain("function Resolve-BackendPort");
    expect(smokeScript).toContain('$env:MILADY_API_PORT = "$BackendPort"');
    expect(smokeScript).toContain('$env:ELIZA_API_PORT = "$BackendPort"');
    expect(smokeScript).toContain('$env:ELIZA_PORT = "$BackendPort"');
  });

  it("runs and uploads a clean Windows installer proof artifact on every release build", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
    const proofScript = fs.readFileSync(WINDOWS_INSTALLER_PROOF_PATH, "utf8");

    expect(workflow).toContain("name: Run Windows clean installer proof");
    expect(workflow).toContain(
      "apps/app/electrobun/scripts/verify-windows-installer-proof.ps1",
    );
    expect(workflow).toContain("name: Upload Windows installer proof artifact");
    expect(workflow).toContain(
      "path: apps/app/electrobun/artifacts/windows-installer-proof/**",
    );
    expect(workflow).toContain(
      "MILADY_TEST_WINDOWS_PROOF_INSTALL_DIR: C:\\mi-proof",
    );
    expect(workflow).toContain(
      "if: always() && matrix.platform.os == 'windows'",
    );

    expect(proofScript).toContain("Milady-Setup-*.exe");
    expect(proofScript).toContain("smoke-test-windows.ps1");
    expect(proofScript).toContain("Start Menu");
    expect(proofScript).toContain("unins*.exe");
    expect(proofScript).toContain("proof-summary.json");
  });

  it("normalizes Windows setup upload inputs down to canonical installer naming", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      '$canonicalInstallers = Get-ChildItem -Path $artifactsDir -File -Filter "Milady-Setup-*.exe"',
    );
    expect(workflow).toContain(
      'Write-Warning "Removing non-canonical setup executable before upload:',
    );
    expect(workflow).toContain(
      'Write-Error "Multiple canonical Windows installers found before compression."',
    );
  });

  it("publishes a plain Windows installer artifact for canary builds", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "name: Prepare public canary Windows installer artifact",
    );
    expect(workflow).toContain(
      "if: matrix.platform.os == 'windows' && needs.prepare.outputs.env == 'canary'",
    );
    expect(workflow).toContain(
      '$canonicalInstallers = Get-ChildItem -Path $artifactsDir -File -Filter "Milady-Setup-*.exe"',
    );
    expect(workflow).toContain(
      "Copy-Item $canonicalInstaller.FullName -Destination $publicCanaryDir -Force",
    );
    expect(workflow).toContain(
      '$canonicalInstallerZips = Get-ChildItem -Path $artifactsDir -File -Filter "Milady-Setup-*.exe.zip"',
    );
    expect(workflow).toContain(
      "No canonical Windows installer (or zip fallback) found for canary artifact publishing.",
    );
    expect(workflow).toContain(
      '$publicInstallers = Get-ChildItem -Path $publicCanaryDir -File -Filter "Milady-Setup-*.exe"',
    );
    expect(workflow).toContain("name: Upload public canary installer artifact");
    expect(workflow).toContain(
      "name: electrobun-$" +
        "{{ matrix.platform.artifact-name }}-public-installer",
    );
    expect(workflow).toContain(
      "path: apps/app/electrobun/artifacts/public-canary-installer/Milady-Setup-*.exe",
    );
  });

  it("seeds the Windows embedding model cache before packaged smoke", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("name: Seed Windows embedding model cache");
    expect(workflow).toContain(
      '$modelName = "nomic-embed-text-v1.5.Q4_K_S.gguf"',
    );
    expect(workflow).toContain(
      '$modelRepo = "nomic-ai/nomic-embed-text-v1.5-GGUF"',
    );
    expect(workflow).toContain(
      "Invoke-WebRequest -Uri $url -OutFile $modelPath",
    );
  });

  it("runs the Windows packaged renderer bootstrap check without installing a separate browser", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain(
      "name: Run Windows packaged renderer bootstrap check",
    );
    expect(workflow).toContain("bun run test:desktop:playwright");
    expect(workflow).toContain('MILADY_DISABLE_LOCAL_EMBEDDINGS: "1"');
    expect(workflow).toContain(
      "ANTHROPIC_API_KEY: $" + "{{ secrets.ANTHROPIC_API_KEY }}",
    );
    expect(workflow).not.toContain(
      "name: Install Playwright Chromium (Windows)",
    );
    expect(workflow).not.toContain(
      "bunx playwright install chromium --with-deps",
    );
  });

  it("verifies the packaged Windows renderer reaches the external API without CDP assumptions", () => {
    const windowsPackagedTest = fs.readFileSync(
      WINDOWS_PACKAGED_TEST_PATH,
      "utf8",
    );
    const windowsBootstrapHelper = fs.readFileSync(
      WINDOWS_PACKAGED_BOOTSTRAP_HELPER_PATH,
      "utf8",
    );
    const windowsEnvHelper = fs.readFileSync(
      WINDOWS_PACKAGED_ENV_HELPER_PATH,
      "utf8",
    );

    expect(windowsPackagedTest).toContain('from "./windows-test-env"');
    expect(windowsPackagedTest).toContain("createPackagedWindowsAppEnv({");
    expect(windowsPackagedTest).toContain("apiBase: api.baseUrl");
    expect(windowsPackagedTest).toContain("appData: userDataDir");
    expect(windowsPackagedTest).toContain("localAppData: localUserDataDir");
    expect(windowsPackagedTest).toContain('from "./windows-bootstrap"');
    expect(windowsPackagedTest).toContain(
      "hasPackagedRendererBootstrapRequests(api.requests)",
    );
    expect(windowsEnvHelper).toContain(
      "MILADY_DESKTOP_TEST_API_BASE: args.apiBase",
    );
    expect(windowsEnvHelper).toContain('MILADY_DISABLE_LOCAL_EMBEDDINGS: "1"');
    expect(windowsEnvHelper).toContain('ELECTROBUN_CONSOLE: "1"');
    expect(windowsEnvHelper).toContain('"MILADY_RENDERER_URL"');
    expect(windowsEnvHelper).toContain('"VITE_DEV_SERVER_URL"');
    expect(windowsEnvHelper).toContain("for (const key of STRIPPED_ENV_KEYS)");
    expect(windowsEnvHelper).toContain("APPDATA: args.appData");
    expect(windowsEnvHelper).toContain("LOCALAPPDATA: args.localAppData");
    expect(windowsBootstrapHelper).toContain('"/api/status"');
    expect(windowsBootstrapHelper).toContain('"/api/config"');
    expect(windowsBootstrapHelper).toContain('"/api/drop/status"');
    expect(windowsBootstrapHelper).toContain('"/api/stream/settings"');
    expect(windowsPackagedTest).toContain("waitForRendererBootstrap");
    expect(windowsPackagedTest).not.toContain("chromium.connectOverCDP");
    expect(windowsPackagedTest).not.toContain("--remote-debugging-port");
    expect(windowsPackagedTest).not.toContain(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
    );
  });

  it("does not statically import @elizaos/app-hyperscape at the top level", () => {
    const serverSource = fs.readFileSync(SERVER_TS_PATH, "utf8");

    // Must NOT have a top-level static import of the package
    const lines = serverSource.split("\n");
    const staticImports = lines.filter(
      (line) =>
        /^\s*import\s/.test(line) && line.includes("@elizaos/app-hyperscape"),
    );
    expect(staticImports).toHaveLength(0);
  });

  it("logs startApiServer failures so they are visible in packaged builds", () => {
    const elizaSource = fs.readFileSync(ELIZA_TS_PATH, "utf8");

    // The catch block around startApiServer must log the error
    // so failures are visible in Electrobun agent.ts output.
    const catchIndex = elizaSource.indexOf("catch (apiErr)");
    expect(catchIndex).toBeGreaterThan(-1);
  });

  it("has a server-only mode block after the API server catch", () => {
    const elizaSource = fs.readFileSync(ELIZA_TS_PATH, "utf8");

    // Server-only mode section must exist after the catch block
    const catchIndex = elizaSource.indexOf("catch (apiErr)");
    expect(catchIndex).toBeGreaterThan(-1);
    const serverOnlyIndex = elizaSource.indexOf("serverOnly", catchIndex);
    expect(serverOnlyIndex).toBeGreaterThan(catchIndex);
  });
});
