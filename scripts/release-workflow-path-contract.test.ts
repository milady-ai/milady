import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const githubTokenInput = ["github_token: $", "{{ secrets.GITHUB_TOKEN }}"].join(
  "",
);
const nodeSourceNpmProvideCheck = [
  "dpkg-query -W -f='",
  "$",
  "{Version} ",
  "$",
  "{Provides}\\n' nodejs | grep -Eq '(^|, )npm(,|$)'",
].join("");

function readWorkflow(name: string) {
  return fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", name),
    "utf8",
  );
}

function readAction(relativePath: string) {
  return fs.readFileSync(
    path.join(repoRoot, ".github", "actions", relativePath),
    "utf8",
  );
}

function readElizaScript(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, "eliza", relativePath), "utf8");
}

function extractAddedFileFromPatch(patch: string, filePath: string) {
  const marker = `diff --git a/${filePath} b/${filePath}`;
  const start = patch.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const nextDiff = patch.indexOf("\ndiff --git ", start + marker.length);
  const section =
    nextDiff === -1 ? patch.slice(start) : patch.slice(start, nextDiff);
  const hunkMatch = /^@@ -0,0 \+1,(\d+) @@$/m.exec(section);
  expect(hunkMatch).not.toBeNull();

  const addedLines = section
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));

  expect(addedLines).toHaveLength(Number(hunkMatch?.[1]));
  return addedLines.join("\n");
}

describe("release workflow path contract", () => {
  it("hydrates the legacy electrobun compatibility dir in release workflows", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
  });

  it("uses the verified Bun runtime for release packaging", () => {
    const setupBunWorkspace = readAction("setup-bun-workspace/action.yml");
    const agentRelease = readWorkflow("agent-release.yml");
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(setupBunWorkspace).toContain('default: "1.3.13"');
    expect(agentRelease).toContain('BUN_VERSION: "1.3.13"');
    expect(releaseElectrobun).toContain('BUN_VERSION: "1.3.13"');
  });

  it("runs eliza repo setup from the Milady root during postinstall", () => {
    const postinstall = fs.readFileSync(
      path.join(repoRoot, "scripts", "milady-postinstall-repo-setup.mjs"),
      "utf8",
    );

    expect(postinstall).toContain(
      'const repoRoot = path.resolve(__dirname, "..");',
    );
    expect(postinstall).toContain("await runRepoSetup(repoRoot);");
    expect(postinstall).not.toContain("await runRepoSetup();");
  });

  it("uses the mobile build helper for release Android and iOS validation jobs", () => {
    const agentRelease = readWorkflow("agent-release.yml");
    const mobileBuildHelper = readElizaScript(
      path.join("packages", "app-core", "scripts", "run-mobile-build.mjs"),
    );

    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(agentRelease).toContain(
      '"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "ndk;29.0.13113456"',
    );
    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(agentRelease).not.toContain(
      "Build web assets\n        run: |\n          bun install --ignore-scripts\n          bun run postinstall\n          bun run build",
    );
    expect(mobileBuildHelper).toContain(
      "Usage: node scripts/run-mobile-build.mjs <android|android-system|ios|ios-overlay>",
    );
    expect(mobileBuildHelper).toContain('if (target === "android") {');
    expect(mobileBuildHelper).toContain("await buildIos();");
  });

  it("keeps macOS App Store validation on the source-workspace install path", () => {
    const agentRelease = readWorkflow("agent-release.yml");
    const macStoreBlock = agentRelease.slice(
      agentRelease.indexOf("  build-macos-store:"),
      agentRelease.indexOf("  build-homepage:"),
    );

    expect(macStoreBlock).toContain('MILADY_SKIP_LOCAL_UPSTREAMS: ""');
    expect(macStoreBlock).toContain(
      "uses: ./.github/actions/setup-bun-workspace",
    );
    expect(macStoreBlock).toContain(
      "install-command: bun install --ignore-scripts --no-frozen-lockfile",
    );
    expect(macStoreBlock).toContain('install-native-deps: "false"');
    expect(macStoreBlock).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(macStoreBlock).not.toContain(
      "node scripts/disable-local-eliza-workspace.mjs",
    );
    expect(macStoreBlock).not.toContain("bun install --ignore-scripts\n");
  });

  it("does not reinstall eliza/packages/app-core directly in the windows preload smoke job", () => {
    const workflow = readWorkflow("windows-desktop-preload-smoke.yml");

    expect(workflow).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core --ignore-scripts",
    );
    expect(workflow).toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/patch-workspace-plugins.mjs",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/patch-deps.mjs",
    );
    expect(workflow).toContain(
      "node eliza/packages/app-core/scripts/ensure-type-package-aliases.mjs",
    );
    expect(workflow).toContain(
      "System git config failed; falling back to --global.",
    );
    expect(workflow).toContain(
      "node ../../scripts/build-electrobun-preload.mjs",
    );
    expect(workflow).not.toContain("run: bun run build:preload");
  });

  it("normalizes runner root ownership before snap builds", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");

    for (const workflow of [snapBuild, publishPackages, agentRelease]) {
      expect(workflow).toContain("Normalize runner root ownership for snapd");
      expect(workflow).toContain("ROOT_OWNER=\"$(stat -c '%u:%g' /)\"");
      expect(workflow).toContain(`if [ "\${ROOT_OWNER}" = "0:0" ]; then`);
      expect(workflow).toContain(
        "if sudo -n chown root:root / 2>/dev/null; then",
      );
    }
  });

  it("bootstraps generated data before the snap recipe runs the production build", () => {
    const snapcraft = readElizaScript(
      path.join("packages", "app-core", "packaging", "snap", "snapcraft.yaml"),
    );

    expect(snapcraft).toContain(
      "Inject tailwindcss into eliza/packages/app-core/node_modules",
    );
    expect(snapcraft).toContain("npm view tailwindcss dist.tarball");
    expect(snapcraft).toContain(
      "node eliza/packages/app-core/scripts/ensure-shared-i18n-data.mjs",
    );
    expect(snapcraft).toContain(
      "node eliza/packages/app-core/scripts/patch-deps.mjs || true",
    );
    expect(snapcraft).toContain(
      "node eliza/packages/app-core/scripts/link-browser-server.mjs || true",
    );
  });

  it("tests the snap using the milady command name", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");

    expect(snapBuild).toContain("snap list milady");
    expect(snapBuild).toContain("milady --version");
    expect(snapBuild).toContain("milady --help");
    expect(snapBuild).not.toContain("snap list elizaos-app");
    expect(snapBuild).not.toContain("elizaos-app --version");
  });

  it("generates snap protobuf types with buf instead of reinstalling the schemas workspace", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");

    expect(snapBuild).toContain("uses: bufbuild/buf-setup-action@v1");
    expect(snapBuild).toContain(githubTokenInput);
    expect(snapBuild).toContain("buf dep update");
    expect(snapBuild).toContain("buf generate");
    expect(snapBuild).not.toContain("bun install --ignore-scripts");
  });

  it("authenticates buf setup downloads in release workflows", () => {
    for (const workflowName of [
      "build-cloud-agent.yml",
      "build-cloud-image.yml",
      "snap-build-test.yml",
    ]) {
      const workflow = readWorkflow(workflowName);

      expect(workflow).toContain("uses: bufbuild/buf-setup-action@v1");
      expect(workflow).toContain(githubTokenInput);
    }
  });

  it("hydrates agent release package jobs without recursive checkout", () => {
    const testPackaging = readWorkflow("test-packaging.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");
    const checkoutWithRecursiveSubmodules =
      /uses: actions\/checkout@v4\s+with:\s+submodules: recursive/g;

    expect(
      Array.from(testPackaging.matchAll(checkoutWithRecursiveSubmodules))
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      Array.from(publishPackages.matchAll(checkoutWithRecursiveSubmodules))
        .length,
    ).toBeGreaterThanOrEqual(4);
    expect(agentRelease).not.toContain("submodules: recursive");
    expect(agentRelease).toContain(
      "uses: ./.github/actions/setup-bun-workspace",
    );
    expect(agentRelease).toContain(
      [
        "run: |",
        "          git submodule sync -- eliza",
        "          git submodule update --init --depth=1 eliza",
        "          node scripts/init-submodules.mjs",
        "          node scripts/apply-eliza-ci-patches.mjs",
        "          node scripts/disable-local-eliza-workspace.mjs",
      ].join("\n"),
    );
  });

  it("initializes tracked workspace submodules before packing JS tarballs", () => {
    const testPackaging = readWorkflow("test-packaging.yml");

    expect(testPackaging).toContain(
      "pack-and-test-js:\n    name: Pack & Test JS Tarballs",
    );
    expect(testPackaging).toContain("run: node scripts/init-submodules.mjs");
  });

  it("hydrates eliza before nested submodule recursion in the release contract workflow", () => {
    const releaseContract = readWorkflow("test-electrobun-release.yml");
    const elizaInit = releaseContract.indexOf(
      "git submodule update --init --depth=1 eliza",
    );
    const trackedInit = releaseContract.indexOf(
      "run: node scripts/init-submodules.mjs",
    );

    expect(elizaInit).toBeGreaterThanOrEqual(0);
    expect(trackedInit).toBeGreaterThanOrEqual(0);
    expect(elizaInit).toBeLessThan(trackedInit);
  });

  it("keeps website blocker desktop smoke blocking through the headless Electrobun bridge", () => {
    const workflow = readWorkflow("test.yml");
    const desktopSmokeBlock = workflow.slice(
      workflow.indexOf("  website-blocker-desktop-smoke:"),
      workflow.indexOf("  ios-website-blocker-build:"),
    );

    expect(desktopSmokeBlock).toContain('MILADY_DESKTOP_HEADLESS_SMOKE: "1"');
    expect(desktopSmokeBlock).not.toContain("continue-on-error: true");
    expect(desktopSmokeBlock).toContain("Run website blocker desktop smokes");
  });

  it("keeps canonical Tests reporting live action coverage availability", () => {
    const workflow = readWorkflow("test.yml");
    const actionE2eBlock = workflow.slice(
      workflow.indexOf("  action-e2e:"),
      workflow.indexOf("  validation-e2e:"),
    );
    const testStatusBlock = workflow.slice(workflow.indexOf("  test-status:"));

    expect(actionE2eBlock).toContain("github.event_name == 'push'");
    expect(actionE2eBlock).toContain("run-action-e2e");
    expect(actionE2eBlock).toContain(
      "Action Invocation E2E skipped because the configured external provider is unavailable.",
    );
    expect(testStatusBlock).toContain("action-e2e,");
    expect(testStatusBlock).toContain("strict_results=");
    expect(testStatusBlock).toContain('if [ "$result" != "success" ]; then');
  });

  it("uses the canonical Eliza Cloud secret aliases without hard-requiring external quota", () => {
    const testsWorkflow = readWorkflow("test.yml");
    const releaseWorkflow = readWorkflow("release-electrobun.yml");
    const cloudKeyExpression =
      "secrets.ELIZAOS_CLOUD_API_KEY != '' && secrets.ELIZAOS_CLOUD_API_KEY || secrets.ELIZACLOUD_API_KEY";

    expect(testsWorkflow).toContain(cloudKeyExpression);
    expect(testsWorkflow).toContain(
      "No Eliza Cloud API key configured - skipping optional cloud live E2E.",
    );
    expect(testsWorkflow).toContain(
      "Cloud Live E2E skipped because the configured external provider is unavailable.",
    );
    expect(releaseWorkflow).toContain(cloudKeyExpression);
    expect(releaseWorkflow).toContain(
      "No Eliza Cloud API key configured for release validation - skipping optional cloud live regression.",
    );
    expect(releaseWorkflow).toContain(
      "Optional cloud live regression failed; release validation continues with deterministic build and packaging checks.",
    );
  });

  it("keeps plugin-agent-orchestrator submodule init as the published release-check version source", () => {
    const releaseContract = readWorkflow("test-electrobun-release.yml");

    expect(releaseContract).toContain(
      "git -C eliza submodule update --init plugins/plugin-agent-orchestrator",
    );
    expect(releaseContract).toContain("published fallback install does not");
  });

  it("keeps cloud image builds aligned with the published-workspace release path", () => {
    const buildCloudImage = readWorkflow("build-cloud-image.yml");
    const fallbackDeps = fs.readFileSync(
      path.join(
        repoRoot,
        "scripts",
        "install-published-workspace-fallback-deps.sh",
      ),
      "utf8",
    );

    expect(buildCloudImage).toContain(
      "git submodule update --init --depth=1 eliza",
    );
    expect(buildCloudImage).toContain(
      "bash scripts/install-published-workspace-fallback-deps.sh",
    );
    expect(buildCloudImage).toContain("uses: bufbuild/buf-setup-action@v1");
    expect(buildCloudImage).toContain(githubTokenInput);
    expect(buildCloudImage).toContain("buf dep update && buf generate");
    expect(buildCloudImage).toContain("cd ../typescript");
    expect(buildCloudImage).toContain(
      "node ../shared/scripts/generate-keywords.mjs --target ts",
    );
    expect(buildCloudImage).toContain('ignoreDeprecations: "6.0"');
    expect(buildCloudImage).toContain(
      "Inject tailwindcss into eliza/packages/app-core/node_modules",
    );
    expect(buildCloudImage).toContain("uses: docker/setup-buildx-action@v3");
    expect(buildCloudImage).toContain("continue-on-error: true");
    expect(buildCloudImage).toContain(
      "Build and push cloud app image with Buildx fallback",
    );
    expect(buildCloudImage).toContain("const manifests = [");
    expect(buildCloudImage).toContain(
      "const unpublished = /^@elizaos\\/(app-|capacitor-|plugin-agent-orchestrator|plugin-app-control|plugin-cli|plugin-imessage|plugin-local-ai|plugin-pdf|plugin-wechat|steward-)/;",
    );
    expect(buildCloudImage).toContain(
      "plugin-agent-orchestrator|plugin-app-control|plugin-cli|plugin-imessage",
    );
    expect(buildCloudImage).toContain(
      '"@elizaos/app-core": "file:./eliza/packages/app-core"',
    );
    expect(buildCloudImage).toContain(
      '"@elizaos/agent": "file:./eliza/packages/agent"',
    );
    expect(fallbackDeps).toContain(
      ['local link_all_store_packages="', '{2:-0}"'].join("$"),
    );
    expect(fallbackDeps).toContain(
      '"eliza/packages/typescript/package.json" \\\n      1',
    );
    expect(fallbackDeps).toContain(
      '"eliza/packages/app-core/package.json" \\\n      1',
    );
    expect(fallbackDeps).toContain(
      '"eliza/packages/agent/package.json" \\\n      1',
    );
  });

  it("repairs known eliza patch files before Docker image installs", () => {
    const buildDocker = readWorkflow("build-docker.yml");

    expect(buildDocker).toContain("name: Repair known eliza patch files");
    expect(buildDocker).toContain("repairKnownElizaPatchFiles");
    expect(
      buildDocker.indexOf("name: Repair known eliza patch files"),
    ).toBeLessThan(buildDocker.indexOf("name: Install dependencies"));
  });

  it("patches Android release build compatibility before release Android validation", () => {
    const agentRelease = readWorkflow("agent-release.yml");
    const testWorkflow = readWorkflow("test.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );
    const mobileCompatScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "patch-mobile-build-release-compat.mjs"),
      "utf8",
    );

    expect(agentRelease).toContain(
      "name: Patch Android release build compatibility",
    );
    expect(agentRelease).toContain(
      "node scripts/patch-mobile-build-release-compat.mjs",
    );
    expect(mobileCompatScript).toContain("gradle-9.4.1-all.zip");
    expect(mobileCompatScript).toContain("llama-cpp-capacitor");
    expect(mobileCompatScript).toContain("patchRunMobileBuildText");
    expect(mobileCompatScript).toContain(
      "patchAndroidGradleWrapperForReleaseCompat",
    );
    expect(mobileCompatScript).toContain("tasks\\.whenTaskAdded");
    expect(mobileCompatScript).toContain(
      "node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(mobileCompatScript).toContain(
      "apps/app/node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(mobileCompatScript).toContain(
      "apps/app/android/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(patch).toContain("MiladyBootReceiver.java");
    expect(patch).toContain("AppOpsManager.class.getMethod(");
    expect(patch).toContain("invokeSetMode(appOps, context)");
    expect(patch).not.toContain("+            appOps.setMode(");
    expect(patch).not.toContain(
      'selectLiveProvider("openai") ?? selectLiveProvider()',
    );
    expect(patch).toContain('selectLiveProvider("elizacloud")');
    expect(patch).toContain('selectLiveProvider("anthropic")');
    expect(patch).toContain('selectLiveProvider("google")');
    expect(patch).toContain('selectLiveProvider("groq")');
    expect(patch).toContain('selectLiveProvider("openrouter")');
    expect(patch.indexOf('selectLiveProvider("elizacloud")')).toBeLessThan(
      patch.indexOf('selectLiveProvider("anthropic")'),
    );
    expect(patch).toContain('plugin: "@elizaos/plugin-elizacloud"');
    expect(patch).toContain("ELIZAOS_CLOUD_ACTION_PLANNER_MODEL: largeModel");
    expect(
      agentRelease.indexOf("name: Patch Android release build compatibility"),
    ).toBeLessThan(
      agentRelease.indexOf(
        "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
      ),
    );
    expect(
      agentRelease.indexOf(
        "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
      ),
    ).toBeLessThan(agentRelease.indexOf("working-directory: apps/app/android"));

    const websiteBlockerAndroidBlock = testWorkflow.slice(
      testWorkflow.indexOf("  website-blocker-mobile-android:"),
      testWorkflow.indexOf("  website-blocker-mobile-ios:"),
    );
    expect(websiteBlockerAndroidBlock).toContain(
      "name: Apply Milady eliza CI patches",
    );
    expect(
      websiteBlockerAndroidBlock.indexOf("name: Apply Milady eliza CI patches"),
    ).toBeLessThan(
      websiteBlockerAndroidBlock.indexOf(
        "name: Patch Android release build compatibility",
      ),
    );
  });

  it("keeps the electrobun release workflow aligned with the Agent Browser Bridge companion contract", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const rootPackageJson = fs.readFileSync(
      path.join(repoRoot, "package.json"),
      "utf8",
    );

    expect(rootPackageJson).toContain(
      '"browser-bridge:package:release": "cd apps/browser-bridge && bun run package:release"',
    );
    expect(releaseElectrobun).toContain(
      "name: Build Agent Browser Bridge companions",
    );
    expect(releaseElectrobun).toContain(
      "if bun run browser-bridge:package:release; then",
    );
    expect(releaseElectrobun).toContain("name: browser-bridge-store-bundles");
    expect(releaseElectrobun).toContain(
      "name: Publish Agent Browser Bridge companions",
    );
    expect(releaseElectrobun).toContain(
      "name: Attach Agent Browser Bridge assets to GitHub release",
    );
    expect(releaseElectrobun).toContain("pattern: browser-bridge-*");
  });

  it("generates protobuf types before staging Electrobun desktop bundles", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const generateProto = releaseElectrobun.indexOf(
      "bunx @bufbuild/buf@1.67.0 generate",
    );
    const generateKeywords = releaseElectrobun.indexOf(
      "node eliza/packages/shared/scripts/generate-keywords.mjs --target ts",
    );
    const stageDesktop = releaseElectrobun.indexOf(
      "node eliza/packages/app-core/scripts/desktop-build.mjs stage",
    );

    expect(generateKeywords).toBeGreaterThanOrEqual(0);
    expect(generateProto).toBeGreaterThanOrEqual(0);
    expect(releaseElectrobun).toContain(
      `buf generate failed on attempt \${attempt}; retrying in 15 seconds`,
    );
    expect(stageDesktop).toBeGreaterThanOrEqual(0);
    expect(releaseElectrobun).not.toContain(
      "[ ! -d eliza/packages/typescript/src/types/generated ]",
    );
    expect(releaseElectrobun).toContain(
      "test -f eliza/packages/typescript/src/types/generated/eliza/v1/agent_pb.ts",
    );
    expect(releaseElectrobun).toContain(
      "test -f eliza/packages/typescript/src/types/generated/eliza/v1/components_pb.ts",
    );
    expect(releaseElectrobun).toContain(
      "test -f eliza/packages/shared/src/i18n/generated/validation-keyword-data.js",
    );
    expect(releaseElectrobun).toContain(
      "mkdir -p dist/node_modules/@elizaos/shared/src/i18n/generated",
    );
    expect(releaseElectrobun).toContain(
      "cp eliza/packages/shared/src/i18n/generated/validation-keyword-data.ts dist/node_modules/@elizaos/shared/src/i18n/generated/",
    );
    expect(releaseElectrobun).toContain(
      "cp eliza/packages/shared/src/i18n/generated/validation-keyword-data.js dist/node_modules/@elizaos/shared/src/i18n/generated/",
    );
    expect(releaseElectrobun).toContain(
      "test -f dist/node_modules/@elizaos/shared/src/i18n/generated/validation-keyword-data.js",
    );
    expect(generateKeywords).toBeLessThan(stageDesktop);
    expect(generateProto).toBeLessThan(stageDesktop);
  });

  it("only enables Electrobun release patch generation for non-draft publish builds", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      `ELIZA_RELEASE_URL: \${{ (github.event_name != 'workflow_call' || inputs.publish_release) && !inputs.draft && 'https://releases.milady.ai/' || '' }}`,
    );
  });

  it("repairs known eliza patch files before shared workspace installs", () => {
    const setupBunWorkspace = readAction("setup-bun-workspace/action.yml");

    expect(setupBunWorkspace).toContain("name: Repair known eliza patch files");
    expect(setupBunWorkspace).toContain("repairKnownElizaPatchFiles");
    expect(
      setupBunWorkspace.indexOf("name: Repair known eliza patch files"),
    ).toBeLessThan(setupBunWorkspace.indexOf("name: Install dependencies"));
  });

  it("uses the desktop-build command prefix variable for macOS Intel packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      'ELIZA_DESKTOP_COMMAND_PREFIX="arch -x86_64" node eliza/packages/app-core/scripts/desktop-build.mjs stage',
    );
    expect(releaseElectrobun).toContain(
      'ELIZA_DESKTOP_COMMAND_PREFIX="arch -x86_64" node eliza/packages/app-core/scripts/desktop-build.mjs package',
    );
    expect(releaseElectrobun).not.toContain("MILADY_DESKTOP_COMMAND_PREFIX");
  });

  it("uploads canonical Electrobun build diagnostics when release packaging fails", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "name: Dump Electrobun build diagnostics",
    );
    expect(releaseElectrobun).toContain(
      `name: electrobun-\${{ matrix.platform.artifact-name }}-build-diagnostics`,
    );
    expect(releaseElectrobun).toContain(
      "eliza/packages/app-core/platforms/electrobun/build/**/wrapper-diagnostics.json",
    );
  });

  it("probes the Electrobun bun entry build before release packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const probeBuild = releaseElectrobun.indexOf(
      "name: Probe Electrobun bun entry build",
    );
    const packageBuild = releaseElectrobun.indexOf(
      "name: Build Electrobun app",
    );

    expect(probeBuild).toBeGreaterThanOrEqual(0);
    expect(packageBuild).toBeGreaterThanOrEqual(0);
    expect(probeBuild).toBeLessThan(packageBuild);
    expect(releaseElectrobun).toContain(
      "bun build src/index.ts --target=bun --outdir",
    );
  });

  it("resolves release versions from canonical semver tags", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain("name: Fetch canonical release tags");
    expect(agentRelease).toContain("https://github.com/milady-ai/milady.git");
    expect(agentRelease).not.toContain(
      "Could not fetch canonical release tags; using local tags only",
    );
    expect(agentRelease).toContain("sort -V | tail -1");
    expect(agentRelease).not.toContain(
      "git tag --sort=-creatordate | grep '^v[0-9]",
    );
  });

  it("allows repo maintainers to manually dispatch agent releases", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain("getCollaboratorPermissionLevel");
    expect(agentRelease).toContain(
      "const isRepoMaintainer = ['admin', 'maintain', 'write'].includes(repoPermission);",
    );
    expect(agentRelease).toContain(
      "let allowed = isOrgMember || isForkOwner || isRepoMaintainer;",
    );
  });

  it("aligns the canonical Electrobun package version before release packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "eliza/packages/app-core/platforms/electrobun/package.json",
    );
    expect(releaseElectrobun).toContain(
      "eliza/packages/app-core/platforms/electrobun/electrobun.config.ts",
    );
  });

  it("keeps Windows release packaging on the last green dependency path", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );
    const buildJobStart = releaseElectrobun.indexOf("\n  build:\n");
    expect(buildJobStart).toBeGreaterThan(-1);

    const fallbackInstallStart = releaseElectrobun.indexOf(
      "      - name: Install published-workspace fallback dependencies",
      buildJobStart,
    );
    expect(fallbackInstallStart).toBeGreaterThan(-1);

    const fallbackInstallBlock = releaseElectrobun.slice(
      fallbackInstallStart,
      releaseElectrobun.indexOf("\n\n", fallbackInstallStart),
    );
    expect(fallbackInstallBlock).toContain(
      "if: matrix.platform.os != 'windows'",
    );
    expect(fallbackInstallBlock).toContain(
      "run: bash scripts/install-published-workspace-fallback-deps.sh",
    );

    const windowsElectrobunInstallStart = releaseElectrobun.indexOf(
      "      - name: Install Windows Electrobun package dependency",
      fallbackInstallStart,
    );
    expect(windowsElectrobunInstallStart).toBeGreaterThan(-1);

    const windowsElectrobunInstallBlock = releaseElectrobun.slice(
      windowsElectrobunInstallStart,
      releaseElectrobun.indexOf("\n\n", windowsElectrobunInstallStart),
    );
    expect(windowsElectrobunInstallBlock).toContain(
      "if: matrix.platform.os == 'windows'",
    );
    expect(windowsElectrobunInstallBlock).toContain(
      "bun add --no-save --dev --ignore-scripts \\",
    );
    expect(windowsElectrobunInstallBlock).toContain("electrobun@1.16.0");
    expect(windowsElectrobunInstallBlock).toContain(
      "@elizaos/plugin-agent-skills@alpha",
    );
    expect(windowsElectrobunInstallBlock).toContain(
      "@elizaos/plugin-anthropic@alpha",
    );
    expect(windowsElectrobunInstallBlock).toContain(
      "@elizaos/plugin-telegram@alpha",
    );
    expect(windowsElectrobunInstallBlock).not.toContain(
      "PLUGIN_AGENT_SKILLS_VERSION",
    );

    const windowsTelegramOverlayStart = releaseElectrobun.indexOf(
      "      - name: Build local plugin-telegram and overlay Windows node_modules",
      windowsElectrobunInstallStart,
    );
    expect(windowsTelegramOverlayStart).toBeGreaterThan(-1);

    const windowsTelegramOverlayBlock = releaseElectrobun.slice(
      windowsTelegramOverlayStart,
      releaseElectrobun.indexOf("\n\n", windowsTelegramOverlayStart),
    );
    expect(windowsTelegramOverlayBlock).toContain(
      "if: matrix.platform.os == 'windows'",
    );
    expect(windowsTelegramOverlayBlock).toContain(
      "git -C eliza submodule update --init --depth=1 plugins/plugin-telegram",
    );
    expect(windowsTelegramOverlayBlock).toContain('repo_root="$PWD"');
    expect(windowsTelegramOverlayBlock).toContain(
      '(cd eliza/plugins/plugin-telegram && bun "$repo_root/node_modules/tsup/dist/cli-default.js" src/index.ts src/account-auth-service.ts --format esm --out-dir dist --tsconfig tsconfig.build.json --sourcemap --clean --no-config)',
    );
    expect(windowsTelegramOverlayBlock).toContain(
      'cp -r eliza/plugins/plugin-telegram/dist "$installed_dir/dist"',
    );
    expect(windowsTelegramOverlayBlock).toContain(
      'test -f "$installed_dir/dist/account-auth-service.js"',
    );
    expect(patch).toContain("rewritePackagedLifeOpsTelegramAuthImport");
    expect(patch).toContain(
      '+  if (name === "@elizaos/app-lifeops") {\n+    patchCopiedAppLifeOpsRuntimeImports(packageDir);',
    );
    expect(patch).toContain(
      'from "@elizaos/plugin-telegram/account-auth-service";',
    );
    expect(patch).toContain(
      '+  if (name === "@elizaos/agent") {\n+    patchCopiedAgentRuntimeExports(packageDir);',
    );
    expect(patch).toContain(
      '+const AGENT_DEEP_IMPORT_EXPORT_DIRS = [\n+  "config",\n+  "providers",\n+  "runtime",\n+] as const;',
    );
    expect(patch).toContain("collectAgentDeepImportExportEntries");
    expect(patch).toContain("exportKey:");
    expect(patch).toContain('sourceRelative.replace(/\\.js$/, "")');
  });

  it("proves published agent runtime deep imports before Windows release smoke", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      '"@elizaos/agent/config/plugin-auto-enable"',
    );
    expect(releaseElectrobun).toContain(
      '"@elizaos/agent/runtime/plugin-types"',
    );
    expect(releaseElectrobun).toContain(
      '"@elizaos/app-lifeops/lifeops/telegram-auth"',
    );
    expect(releaseElectrobun).toContain(
      "dist/node_modules/@elizaos/app-lifeops/src/lifeops/telegram-auth.ts",
    );
    expect(releaseElectrobun).toContain(
      'from "@elizaos/plugin-telegram/account-auth-service";',
    );
    expect(releaseElectrobun).toContain(
      "../../../../plugins/plugin-telegram/src/account-auth-service.ts",
    );
    expect(releaseElectrobun).toContain(
      'Join-Path $elizaDist "node_modules\\@elizaos\\agent\\packages\\agent\\src\\$runtimeModule"',
    );
    expect(releaseElectrobun).toContain('"config\\plugin-auto-enable.js"');
    expect(releaseElectrobun).toContain('"./runtime/plugin-types"');
  });

  it("supports Windows-only Electrobun release dispatches", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain("Desktop platform matrix to build");
    expect(releaseElectrobun).toContain("desktop_matrix:");
    expect(releaseElectrobun).toContain(
      [
        "Validate Release Inputs\n    if: $",
        "{{ inputs.platform != 'windows' }}",
      ].join(""),
    );
    expect(releaseElectrobun).toContain(
      ["RELEASE_PLATFORM: $", "{{ inputs.platform || 'all' }}"].join(""),
    );
    expect(releaseElectrobun).toContain(
      '{"platform":[{"name":"Windows","os":"windows","runner":"$' +
        "{{ vars.RUNNER_WINDOWS || 'windows-2025' }}" +
        '","artifact-name":"windows-x64"}]}',
    );
    expect(releaseElectrobun).toContain(
      [
        "matrix: $",
        "{{ fromJson(needs.prepare.outputs.desktop_matrix) }}",
      ].join(""),
    );
    expect(releaseElectrobun).toContain(
      [
        "name: Build Agent Browser Bridge companions",
        "    if: $" + "{{ inputs.platform == '' || inputs.platform == 'all' }}",
      ].join("\n"),
    );
    expect(releaseElectrobun).toContain(
      "(inputs.platform == '' || inputs.platform == 'all') &&",
    );
    expect(releaseElectrobun).toContain(
      "needs.validate-release.result == 'success' || needs.validate-release.result == 'skipped'",
    );
  });

  it("keeps Windows packaged smoke blocking before installer proof", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const smokeStart = releaseElectrobun.indexOf(
      "      - name: Smoke test packaged Windows app",
    );
    const proofStart = releaseElectrobun.indexOf(
      "      - name: Run Windows clean installer proof",
      smokeStart,
    );
    const smokeBlock = releaseElectrobun.slice(smokeStart, proofStart);

    expect(smokeStart).toBeGreaterThan(-1);
    expect(proofStart).toBeGreaterThan(smokeStart);
    expect(smokeBlock).not.toContain("continue-on-error: true");
    expect(smokeBlock).toContain("bun run test:desktop:packaged:windows");
    expect(smokeBlock).toContain(
      'Write-Error "Packaged Windows smoke test exited with code $LASTEXITCODE."',
    );
  });

  it("installs browser automation deps in the published-workspace fallback shim", () => {
    const fallbackScript = fs.readFileSync(
      path.join(
        repoRoot,
        "scripts",
        "install-published-workspace-fallback-deps.sh",
      ),
      "utf8",
    );

    expect(fallbackScript).toContain("playwright-core");
    expect(fallbackScript).toContain('"bun-types"');
    expect(fallbackScript).toContain('"@types/bun"');
    expect(fallbackScript).toContain('"@types/fast-redact"');
    expect(fallbackScript).toContain('"@types/markdown-it"');
    expect(fallbackScript).toContain(
      "eliza/packages/typescript/node_modules/@types/uuid",
    );
    expect(fallbackScript).toContain(
      ".eliza.ci-disabled/packages/typescript/node_modules/@types/uuid",
    );
  });

  it("re-installs @elizaos/core's third-party deps after the workspace is disabled", () => {
    const fallbackScript = fs.readFileSync(
      path.join(
        repoRoot,
        "scripts",
        "install-published-workspace-fallback-deps.sh",
      ),
      "utf8",
    );

    expect(fallbackScript).toContain(
      "append_third_party_dependencies_from_manifest",
    );
    expect(fallbackScript).toContain(
      '"eliza/packages/typescript/package.json"',
    );
    expect(fallbackScript).toContain(
      '".eliza.ci-disabled/packages/typescript/package.json"',
    );
    expect(fallbackScript).toContain('"eliza/packages/agent/package.json"');
    expect(fallbackScript).toContain(
      '".eliza.ci-disabled/packages/agent/package.json"',
    );
    expect(fallbackScript).toContain(
      '"eliza/plugins/plugin-anthropic/typescript/package.json"',
    );
    expect(fallbackScript).toContain(
      '".eliza.ci-disabled/plugins/plugin-anthropic/typescript/package.json"',
    );
    expect(fallbackScript).toContain("ensure_eliza_submodule_manifest");
    expect(fallbackScript).toContain('"plugins/plugin-anthropic"');
    expect(fallbackScript).toContain('"plugins/plugin-agent-skills"');
    expect(fallbackScript).toContain('"plugins/plugin-local-embedding"');
    expect(fallbackScript).toContain('"plugins/plugin-pdf"');
    expect(fallbackScript).toContain('"plugins/plugin-sql"');
    expect(fallbackScript).toContain('"@elizaos/plugin-agent-skills"');
    expect(fallbackScript).toContain('"@elizaos/plugin-local-embedding"');
    expect(fallbackScript).toContain('"@elizaos/plugin-pdf"');
    expect(fallbackScript).toContain('"@elizaos/plugin-sql"');
    expect(fallbackScript).toContain(
      '"eliza/plugins/plugin-agent-skills/typescript/package.json"',
    );
    expect(fallbackScript).toContain(
      '"eliza/plugins/plugin-local-embedding/typescript/package.json"',
    );
    expect(fallbackScript).toContain(
      '"eliza/plugins/plugin-pdf/typescript/package.json"',
    );
    expect(fallbackScript).toContain(
      '"eliza/plugins/plugin-sql/typescript/package.json"',
    );
    expect(fallbackScript).toContain('"jsonrepair"');
    expect(fallbackScript).toContain(
      "plugin-anthropic fails at import time on jsonrepair",
    );
    expect(
      fallbackScript.indexOf(
        'ensure_eliza_submodule_manifest \\\n  "eliza/plugins/plugin-anthropic/typescript/package.json"',
      ),
    ).toBeLessThan(
      fallbackScript.indexOf(
        'append_third_party_dependencies_from_manifest \\\n  "eliza/plugins/plugin-anthropic/typescript/package.json"',
      ),
    );
    expect(fallbackScript).toContain(
      "symlink_installed_packages_into_manifest_node_modules",
    );
    expect(fallbackScript).toContain("MINGW*|MSYS*|CYGWIN*)");
    expect(fallbackScript).toContain('MSYS2_ARG_CONV_EXCL="*"');
    expect(fallbackScript).toContain("mklink /J");
    expect(fallbackScript).toContain("bun_store_entries");
    expect(fallbackScript).toContain(
      "Bun can keep installed packages only in node_modules/.bun on every runner",
    );
    expect(fallbackScript).toContain('grep -Fxq -- "$package_name"');
    expect(fallbackScript).toContain('"node_modules", ".bun"');
    expect(fallbackScript).toContain("compareVersions");
    expect(fallbackScript).toContain("stat.isSymbolicLink()");
    expect(fallbackScript).toContain('cp -LR "$source_path" "$target_path"');
  });

  it("keeps agent runtime plugin dependencies declared for release packaging", () => {
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );
    const bundledWorkspacesScript = readElizaScript(
      path.join(
        "packages",
        "app-core",
        "scripts",
        "ensure-bundled-workspaces.mjs",
      ),
    );
    const buildAgentSkillsArtifactScript = readElizaScript(
      path.join(
        "packages",
        "app-core",
        "scripts",
        "build-bundled-agent-skills-artifact.mjs",
      ),
    );

    expect(patch).toContain("diff --git a/packages/agent/package.json");
    expect(patch).toContain(
      '+    "@elizaos/plugin-agent-skills": "workspace:*",',
    );
    expect(bundledWorkspacesScript).toContain(
      "../../../packages/app-core/scripts/build-bundled-agent-skills-artifact.mjs",
    );
    expect(buildAgentSkillsArtifactScript).toContain(
      'import { resolveRepoRootFromImportMeta } from "./lib/repo-root.mjs";',
    );
    expect(buildAgentSkillsArtifactScript).toContain(
      "const repoRoot = resolveRepoRootFromImportMeta(import.meta.url);",
    );
  });

  it("patches shared keyword generation to emit runtime JavaScript", () => {
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );

    expect(patch).toContain(
      "diff --git a/packages/shared/scripts/generate-keywords.mjs",
    );
    expect(patch).toContain("function generateJavaScript(entries)");
    expect(patch).toContain("validation-keyword-data.js");
  });

  it("patches generated Android files before the release Gradle build", () => {
    const mobileCompatScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "patch-mobile-build-release-compat.mjs"),
      "utf8",
    );

    expect(mobileCompatScript).toContain("patchGradleWrapperText");
    expect(mobileCompatScript).toContain(
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    );
  });

  it("reuses release-installed Electrobun workspaces during packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );

    expect(releaseElectrobun).toContain(
      "name: Patch desktop build workspace install reuse",
    );
    expect(releaseElectrobun).toContain(
      "Reusing release-installed app workspace dependencies",
    );
    expect(releaseElectrobun).toContain(
      "Reusing release-installed Electrobun workspace dependencies",
    );
    expect(releaseElectrobun).toContain("\\r?\\n    cwd: APP_DIR");
    expect(patch).toContain(
      "eliza/packages/app-core/scripts/ensure-electrobun-core.mjs",
    );
  });

  it("prepares and caches Electrobun core binaries before release packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );
    const cacheStep = releaseElectrobun.indexOf(
      "name: Cache Electrobun CLI and core binaries",
    );
    const prepareStep = releaseElectrobun.indexOf(
      "name: Prepare Electrobun core binaries",
    );
    const packageStep = releaseElectrobun.indexOf("name: Build Electrobun app");

    expect(cacheStep).toBeGreaterThanOrEqual(0);
    expect(prepareStep).toBeGreaterThan(cacheStep);
    expect(packageStep).toBeGreaterThan(prepareStep);
    expect(releaseElectrobun).toContain(
      'echo "core-cache-dir=$package_dir/dist-$electrobun_core_target" >> "$GITHUB_OUTPUT"',
    );
    expect(releaseElectrobun).toContain(
      ["$", "{{ steps.resolve-electrobun.outputs.core-cache-dir }}"].join(""),
    );
    expect(releaseElectrobun).toContain(
      'windows-x64)\n              electrobun_core_target="win-x64"',
    );
    expect(releaseElectrobun).toContain(
      "node eliza/packages/app-core/scripts/ensure-electrobun-core.mjs",
    );
    expect(patch).toContain(
      'const windowsTar = "C:\\\\Windows\\\\System32\\\\tar.exe";',
    );
    expect(patch).toContain("getTarExecutable(),");

    const ensureScript = extractAddedFileFromPatch(
      patch,
      "packages/app-core/scripts/ensure-electrobun-core.mjs",
    );
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-electrobun-core-"),
    );
    try {
      const scriptPath = path.join(tempDir, "ensure-electrobun-core.mjs");
      fs.writeFileSync(scriptPath, ensureScript);
      execFileSync(process.execPath, ["--check", scriptPath]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps draft Electrobun fallback artifacts away from release-grade gates", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const windowsSmokeBlock = releaseElectrobun.slice(
      releaseElectrobun.indexOf("name: Smoke test packaged Windows app"),
      releaseElectrobun.indexOf("name: Run Windows clean installer proof"),
    );

    expect(releaseElectrobun).toContain(
      "uploaded draft-validation fallback archive",
    );
    expect(releaseElectrobun).toContain(
      '"eliza/packages/app-core/platforms/electrobun/build"',
    );
    expect(releaseElectrobun).toContain('"apps/app/electrobun/build"');
    expect(releaseElectrobun).toContain(
      `if [ "\${{ inputs.draft }}" != "true" ] || [ "\${{ inputs.publish_release }}" = "true" ]; then`,
    );
    expect(releaseElectrobun).toContain(
      `tar --zstd -cf "$artifact_root/elizaOS-\${{ needs.prepare.outputs.env }}-\${{ matrix.platform.artifact-name }}.tar.zst"`,
    );
    expect(releaseElectrobun).toContain(
      `tar -czf "$artifact_root/elizaOS-\${{ needs.prepare.outputs.env }}-\${{ matrix.platform.artifact-name }}.app.tar.gz"`,
    );
    expect(releaseElectrobun).toContain("Wrote fallback $dest");
    expect(releaseElectrobun).not.toContain("$fallbackZip");
    expect(releaseElectrobun).not.toContain("Extracting draft fallback");
    expect(releaseElectrobun).toContain(
      "steps.build-electrobun-app.outputs.fallback != 'true'",
    );
    expect(releaseElectrobun).toContain(
      "Windows clean installer proof exited with code $LASTEXITCODE.",
    );
    expect(windowsSmokeBlock).toContain("timeout-minutes: 30");
    expect(windowsSmokeBlock).toContain(
      "bun run test:desktop:packaged:windows",
    );
    expect(releaseElectrobun).toContain(
      [
        "name: Verify macOS signature and notarization",
        "        if: matrix.platform.os == 'macos' && steps.build-electrobun-app.outputs.fallback != 'true'",
        "        run: |",
        "          shopt -s nullglob",
      ].join("\n"),
    );
    expect(releaseElectrobun).toContain(
      "No .app bundle or .dmg found in apps/app/electrobun/artifacts",
    );
    for (const stepName of [
      "Install Inno Setup 6.7.1",
      "Extract Windows app bundle for Inno Setup",
      "Build Inno Setup installer",
      "Smoke test packaged Windows app",
      "Build MSIX package",
      "Compress Windows artifacts before upload",
      "Prepare public canary Windows installer artifact",
      "Smoke test packaged macOS app",
    ]) {
      const stepStart = releaseElectrobun.indexOf(`name: ${stepName}`);
      expect(stepStart).toBeGreaterThanOrEqual(0);
      expect(releaseElectrobun.slice(stepStart, stepStart + 240)).toContain(
        "steps.build-electrobun-app.outputs.fallback != 'true'",
      );
    }
    expect(releaseElectrobun).toContain("for build_root in \\");
    expect(releaseElectrobun).toContain("eliza-dist/entry.js found");
    expect(releaseElectrobun).toContain(
      'Join-Path $elizaDist "node_modules\\@elizaos\\shared\\src\\i18n\\generated\\validation-keyword-data.js"',
    );
    expect(releaseElectrobun).toContain(
      "eliza-dist generated keyword data found",
    );
    expect(releaseElectrobun).toContain(
      "dist/node_modules/@elizaos/plugin-telegram/dist/account-auth-service.js",
    );
    expect(releaseElectrobun).toContain(
      'Join-Path $elizaDist "node_modules\\@elizaos\\plugin-telegram\\dist\\account-auth-service.js"',
    );
    expect(releaseElectrobun).toContain(
      "eliza-dist plugin-telegram account auth service found",
    );
    expect(releaseElectrobun).not.toContain(
      "Mirroring eliza-dist -> milady-dist",
    );
    expect(releaseElectrobun).not.toContain('mklink /J `"$miladyDist');
  });

  it("builds the patched Electrobun CLI for every release platform", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );

    const stepStart = releaseElectrobun.indexOf(
      "name: Build patched Electrobun CLI",
    );
    expect(stepStart).toBeGreaterThanOrEqual(0);
    expect(releaseElectrobun.slice(stepStart, stepStart + 260)).not.toContain(
      "matrix.platform.os == 'windows'",
    );
    expect(releaseElectrobun).toContain(
      [
        'node eliza/packages/app-core/scripts/build-patched-electrobun-cli.mjs "$',
        '{{ steps.resolve-electrobun.outputs.package-dir }}" "$',
        '{{ matrix.platform.artifact-name }}"',
      ].join(""),
    );
    expect(patch).toContain("function resolveBuildTarget(value) {");
    expect(patch).toContain(["--target=$", "{buildTarget.bunTarget}"].join(""));
    expect(patch).toContain("[electrobun-build] Bun entry:");
    expect(patch).toContain("targetPaths.BUN_BINARY");
    expect(patch).toContain("Bun CLI fallback succeeded");
  });

  it("keeps the cloud agent template on workspace elizaOS packages before publish materialization", () => {
    const buildCloudImage = readWorkflow("build-cloud-image.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );
    const applyPatchScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "apply-eliza-ci-patches.mjs"),
      "utf8",
    );
    const capabilitiesSection = fs.readFileSync(
      path.join(
        repoRoot,
        "eliza",
        "packages",
        "app-core",
        "src",
        "components",
        "settings",
        "CapabilitiesSection.tsx",
      ),
      "utf8",
    );
    const appearanceSettingsSection = readElizaScript(
      path.join(
        "packages",
        "app-core",
        "src",
        "components",
        "settings",
        "AppearanceSettingsSection.tsx",
      ),
    );

    expect(applyPatchScript).toContain('"--unidiff-zero"');
    expect(appearanceSettingsSection).toContain("settings-companion-vrm-power");
    expect(patch).not.toContain("CapabilitiesSection.tsx");
    expect(capabilitiesSection).toContain(
      "settings.sections.capabilities.computerUseHint",
    );
    expect(patch).toContain("RUN bun run - <<'EOF'");
    expect(buildCloudImage).toContain("Apply Milady eliza CI patches");
    expect(buildCloudImage).toContain(
      "node scripts/apply-eliza-ci-patches.mjs",
    );
    expect(buildCloudImage).toContain("Init cloud image plugin manifests");
    expect(buildCloudImage).toContain("plugins/plugin-sql");
    expect(buildCloudImage).toContain("plugins/plugin-elizacloud");

    for (const packageName of [
      "@elizaos/core",
      "@elizaos/plugin-sql",
      "@elizaos/plugin-elizacloud",
    ]) {
      expect(patch).toContain(`"${packageName}": "workspace:*"`);
    }
  });

  it("keeps agent release publication gated on every release validation job", () => {
    const agentRelease = readWorkflow("agent-release.yml");
    const reusableNpmPublish = readWorkflow("reusable-npm-publish.yml");
    const patch = fs.readFileSync(
      path.join(repoRoot, "patches", "eliza", "ci-release-contracts.patch"),
      "utf8",
    );

    const buildNpmBlock = agentRelease.slice(
      agentRelease.indexOf("  build-npm:"),
      agentRelease.indexOf("  # ── Release validation builds"),
    );
    const releaseValidationBlock = agentRelease.slice(
      agentRelease.indexOf("  # ── Release validation builds"),
      agentRelease.indexOf("  # ── 4. Electrobun + Docker + npm green"),
    );
    const publishBlock = agentRelease.slice(
      agentRelease.indexOf("  publish:"),
      agentRelease.indexOf("  # ── 5. Post-publish"),
    );
    const distributeReleaseBlock = agentRelease.slice(
      agentRelease.indexOf("  distribute-release:"),
    );
    const debianValidationBlock = agentRelease.slice(
      agentRelease.indexOf("  build-debian:"),
      agentRelease.indexOf("  build-ios:"),
    );
    const iosValidationBlock = agentRelease.slice(
      agentRelease.indexOf("  build-ios:"),
      agentRelease.indexOf("  build-macos-store:"),
    );

    expect(buildNpmBlock).not.toContain("continue-on-error: true");
    expect(buildNpmBlock).not.toContain("package.json missing from pack");
    expect(buildNpmBlock).not.toContain(
      "Restore eliza workspace paths for release scripts",
    );
    expect(buildNpmBlock).toContain(
      "node scripts/sanitize-npm-package-metadata.mjs",
    );
    expect(
      buildNpmBlock.indexOf("node scripts/sanitize-npm-package-metadata.mjs"),
    ).toBeLessThan(buildNpmBlock.indexOf("npm pack --dry-run"));
    expect(reusableNpmPublish).toContain(
      "node scripts/sanitize-npm-package-metadata.mjs",
    );
    expect(
      reusableNpmPublish.indexOf(
        "node scripts/sanitize-npm-package-metadata.mjs",
      ),
    ).toBeLessThan(reusableNpmPublish.indexOf("npm pack --dry-run"));
    expect(
      reusableNpmPublish.indexOf(
        "node scripts/sanitize-npm-package-metadata.mjs",
      ),
    ).toBeLessThan(reusableNpmPublish.indexOf("run: npm publish"));
    expect(releaseValidationBlock).not.toContain("continue-on-error: true");
    expect(releaseValidationBlock).not.toContain("failed (non-blocking)");
    expect(releaseValidationBlock).not.toContain('|| echo "::warning::');
    expect(releaseValidationBlock).toContain("ai.elizaos.App.yml");
    expect(releaseValidationBlock).toContain("elizaos-app.flatpak");
    expect(releaseValidationBlock).toContain("name: Stage Debian packaging");
    expect(releaseValidationBlock).toContain(
      "cp -R eliza/packages/app-core/packaging/debian debian",
    );
    expect(releaseValidationBlock).not.toContain(
      "cd eliza/packages/app-core/packaging/debian",
    );
    expect(debianValidationBlock).toContain(
      "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -",
    );
    expect(debianValidationBlock).toContain(
      "sudo apt-get install -y build-essential nodejs dpkg-dev debhelper fakeroot",
    );
    expect(debianValidationBlock).toContain(nodeSourceNpmProvideCheck);
    expect(debianValidationBlock).toContain("uses: oven-sh/setup-bun@v2");
    expect(debianValidationBlock).toContain(
      ["bun-version: $", "{{ env.BUN_VERSION }}"].join(""),
    );
    expect(debianValidationBlock).not.toContain("https://bun.sh/install");
    expect(debianValidationBlock).toContain(
      "dpkg-checkbuilddeps debian/control",
    );
    expect(patch).toContain(
      "node --import tsx scripts/copy-runtime-node-modules.ts --link-only || exit $$?",
    );
    expect(patch).toContain(
      "cp milady.mjs debian/elizaos-app/usr/lib/elizaos-app/elizaos-app.mjs",
    );
    expect(patch).toContain(
      "install -m 644 debian/elizaos-app.service debian/elizaos-app/usr/lib/elizaos-app/elizaos-app.service",
    );
    expect(patch).toContain(
      "-\tinstall -m 644 packaging/debian/elizaos-app.service debian/elizaos-app/usr/lib/elizaos-app/elizaos-app.service",
    );
    expect(patch).toContain(
      "+\tinstall -m 644 debian/elizaos-app.service debian/elizaos-app/usr/lib/elizaos-app/elizaos-app.service",
    );
    expect(patch).toContain("-elizaos-app.mjs usr/lib/elizaos-app/");
    expect(
      patch.indexOf("ELIZAOS_APP_SKIP_LOCAL_UPSTREAMS=1 bun install"),
    ).toBeLessThan(
      patch.indexOf(
        "node --import tsx scripts/copy-runtime-node-modules.ts --link-only",
      ),
    );
    expect(
      patch.indexOf(
        "node --import tsx scripts/copy-runtime-node-modules.ts --link-only",
      ),
    ).toBeLessThan(patch.indexOf("bun run build"));
    expect(agentRelease).toContain("apps/app/ios/App/App.xcodeproj");
    expect(agentRelease).not.toContain("if [ -d ios/App ]; then");
    expect(iosValidationBlock).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(iosValidationBlock).not.toContain("-dry-run");
    expect(debianValidationBlock).not.toContain(" nodejs npm ");
    expect(debianValidationBlock).not.toContain("actions/setup-node@v4");
    expect(releaseValidationBlock).not.toContain("com.milady.Milady.yml");
    expect(releaseValidationBlock).not.toContain("ai.milady.Milady");
    for (const job of [
      "build-electrobun",
      "build-docker",
      "build-cloud-image",
      "build-npm",
      "build-android",
      "build-snap",
      "build-flatpak",
      "build-pypi",
      "build-debian",
      "build-ios",
      "build-macos-store",
      "build-homepage",
      "build-docs",
    ]) {
      expect(publishBlock).toContain(`${job},`);
      expect(publishBlock).toContain(`needs.${job}.result == 'success'`);
    }
    expect(agentRelease).toContain("draft: false");
    expect(agentRelease).toContain("  push-agent-image:");
    expect(agentRelease).toContain("  distribute-release:");
    expect(agentRelease).toContain(
      "uses: ./.github/workflows/release-orchestrator.yml",
    );
    expect(distributeReleaseBlock).toContain(
      "needs: [version, publish, push-agent-image, push-cloud-image]",
    );
    for (const input of [
      "publish_npm: true",
      "publish_packages: true",
      "publish_android: true",
      "publish_apple: true",
      "update_homebrew: true",
      "deploy_homepage: true",
    ]) {
      expect(distributeReleaseBlock).toContain(input);
    }
    expect(agentRelease).toContain(
      ["github-token: $", "{{ secrets.GITHUB_TOKEN }}"].join(""),
    );
    expect(agentRelease).not.toContain(
      "secrets.GH_PAT || secrets.GITHUB_TOKEN",
    );
  });

  it("requires enabled release distribution workflows to succeed", () => {
    const releaseOrchestrator = readWorkflow("release-orchestrator.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const androidRelease = readWorkflow("android-release.yml");
    const appleStoreRelease = readWorkflow("apple-store-release.yml");

    expect(releaseOrchestrator).toContain(
      'PUBLISH_FLATPAK="$PUBLISH_PACKAGES"',
    );
    expect(releaseOrchestrator).not.toContain('PUBLISH_FLATPAK="false"');
    expect(releaseOrchestrator).toContain(
      "Require enabled distributions succeeded",
    );
    expect(releaseOrchestrator).toContain('ANDROID_TRACK="production"');
    expect(releaseOrchestrator).toContain('APPLE_TRACK="app-store"');
    expect(releaseOrchestrator).toContain('ANDROID_TRACK="internal"');
    expect(releaseOrchestrator).toContain('APPLE_TRACK="testflight"');
    expect(releaseOrchestrator).toContain(
      "uses: ./.github/workflows/android-release.yml",
    );
    expect(releaseOrchestrator).toContain(
      "uses: ./.github/workflows/apple-store-release.yml",
    );
    expect(releaseOrchestrator).toContain("platform: both");
    expect(releaseOrchestrator).toContain(
      ["track: $", "{{ needs.prepare.outputs.apple_track }}"].join(""),
    );
    for (const dependency of [
      "needs.publish-npm.result",
      "needs.publish-packages.result",
      "needs.publish-android.result",
      "needs.publish-apple.result",
      "needs.update-homebrew.result",
      "needs.deploy-homepage.result",
    ]) {
      expect(releaseOrchestrator).toContain(dependency);
    }

    expect(publishPackages).toContain(
      "SNAP_STORE_CREDENTIALS is required when Snap publishing is enabled.",
    );
    expect(publishPackages).toContain(
      "APT_REPO_TOKEN is required when apt publishing is enabled.",
    );
    expect(publishPackages).toContain(
      "sudo apt-get install -y nodejs build-essential",
    );
    expect(publishPackages).toContain(nodeSourceNpmProvideCheck);
    expect(publishPackages).toContain("dpkg-checkbuilddeps debian/control");
    expect(publishPackages).toContain(
      "Require enabled package publishers succeeded",
    );
    expect(publishPackages).not.toContain("Snap Store publish skipped");
    expect(publishPackages).not.toContain("APT repository update skipped");
    expect(publishPackages).not.toContain("skipping .deb attachment");
    expect(publishPackages).not.toContain("skipping Flatpak attachment");

    expect(androidRelease).toContain(
      "PLAY_STORE_SERVICE_ACCOUNT_JSON is required for Android release publishing.",
    );
    expect(androidRelease).toContain("name: Build Signed AAB");
    expect(androidRelease).toContain("name: Publish to Play Store");
    expect(androidRelease).toContain("Attach AAB to GitHub Release");
    expect(androidRelease).toContain("bundle exec fastlane supply");
    expect(androidRelease).toContain('--package_name "ai.milady.app"');
    expect(androidRelease).toContain("Require Android release succeeded");
    expect(androidRelease).not.toContain("Play Store upload will be skipped");
    expect(androidRelease).not.toContain("skipping AAB attachment");

    expect(appleStoreRelease).toContain(
      "APP_STORE_APP_ID is required for TestFlight/App Store delivery.",
    );
    expect(appleStoreRelease).toContain("name: Build & Submit iOS");
    expect(appleStoreRelease).toContain("bundle exec fastlane release");
    expect(appleStoreRelease).toContain("bundle exec fastlane beta");
    expect(appleStoreRelease).toContain("name: Build & Submit macOS");
    expect(appleStoreRelease).toContain("Upload to App Store Connect");
    expect(appleStoreRelease).toContain("xcrun altool --upload-app");
    expect(appleStoreRelease).toContain(
      "Require enabled Apple releases succeeded",
    );
    expect(appleStoreRelease).not.toContain("APP_STORE_APP_ID is not set");
    expect(appleStoreRelease).not.toContain("bunx tsdown || true");
    expect(appleStoreRelease).not.toContain("if-no-files-found: warn");
  });

  it("fills existing app-core node_modules mirrors instead of trusting partial directories", () => {
    const script = fs.readFileSync(
      path.join(repoRoot, "scripts", "copy-runtime-node-modules.ts"),
      "utf8",
    );

    expect(script).toContain(
      "fs.rmSync(targetDir, { force: true, recursive: true })",
    );
    expect(script).toContain(
      'const miladyRootBunStore = path.join(miladyRootNodeModules, ".bun");',
    );
    expect(script).toContain(
      'path.join(miladyRootBunStore, entry.name, "node_modules")',
    );
    expect(script).not.toContain(
      "} else if (stat?.isDirectory()) {\n    return null;",
    );
  });
});
