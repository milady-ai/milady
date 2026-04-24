import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

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

describe("release workflow path contract", () => {
  it("hydrates the legacy electrobun compatibility dir in release workflows", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
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
      "Usage: node scripts/run-mobile-build.mjs <android|ios|ios-overlay>",
    );
    expect(mobileBuildHelper).toContain('if (target === "android") {');
    expect(mobileBuildHelper).toContain("await buildIos();");
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
    expect(snapBuild).toContain("buf dep update");
    expect(snapBuild).toContain("buf generate");
    expect(snapBuild).not.toContain("bun install --ignore-scripts");
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
    expect(agentRelease).toContain("run: node scripts/init-submodules.mjs");
    expect(agentRelease).toContain(
      "run: |\n          node scripts/init-submodules.mjs\n          node scripts/disable-local-eliza-workspace.mjs",
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

  it("keeps plugin-agent-orchestrator submodule init as the published release-check version source", () => {
    const releaseContract = readWorkflow("test-electrobun-release.yml");

    expect(releaseContract).toContain(
      "git -C eliza submodule update --init plugins/plugin-agent-orchestrator",
    );
    expect(releaseContract).toContain("published fallback install does not");
  });

  it("keeps cloud image builds aligned with the published-workspace release path", () => {
    const buildCloudImage = readWorkflow("build-cloud-image.yml");

    expect(buildCloudImage).toContain(
      "git submodule update --init --depth=1 eliza",
    );
    expect(buildCloudImage).toContain(
      "bash scripts/install-published-workspace-fallback-deps.sh",
    );
    expect(buildCloudImage).toContain("uses: bufbuild/buf-setup-action@v1");
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
  });

  it("repairs known eliza patch files before Docker image installs", () => {
    const buildDocker = readWorkflow("build-docker.yml");

    expect(buildDocker).toContain("name: Repair known eliza patch files");
    expect(buildDocker).toContain("repairKnownElizaPatchFiles");
    expect(
      buildDocker.indexOf("name: Repair known eliza patch files"),
    ).toBeLessThan(buildDocker.indexOf("name: Install dependencies"));
  });

  it("aligns the Android Gradle wrapper before release Android validation", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain("name: Align Android Gradle wrapper");
    expect(agentRelease).toContain(
      "name: Patch Android mobile build wrapper alignment",
    );
    expect(agentRelease).toContain("gradle-9.4.1-all.zip");
    expect(agentRelease).toContain(
      "node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(agentRelease).toContain(
      "apps/app/node_modules/@capacitor/android/capacitor/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(agentRelease).toContain(
      "apps/app/android/gradle/wrapper/gradle-wrapper.properties",
    );
    expect(
      agentRelease.indexOf("name: Align Android Gradle wrapper"),
    ).toBeLessThan(
      agentRelease.indexOf(
        "name: Patch Android mobile build wrapper alignment",
      ),
    );
    expect(
      agentRelease.indexOf(
        "name: Patch Android mobile build wrapper alignment",
      ),
    ).toBeLessThan(
      agentRelease.indexOf(
        "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
      ),
    );
    expect(
      agentRelease.indexOf(
        "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
      ),
    ).toBeLessThan(
      agentRelease.indexOf("name: Align generated Android Gradle wrapper"),
    );
    expect(
      agentRelease.indexOf("name: Align generated Android Gradle wrapper"),
    ).toBeLessThan(agentRelease.indexOf("working-directory: apps/app/android"));
  });

  it("keeps the electrobun release workflow aligned with the LifeOps Browser companion contract", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");
    const rootPackageJson = fs.readFileSync(
      path.join(repoRoot, "package.json"),
      "utf8",
    );

    expect(rootPackageJson).toContain(
      '"lifeops:browser:package:release": "bun run browser-bridge:package:release"',
    );
    expect(releaseElectrobun).toContain(
      "name: Build LifeOps Browser companions",
    );
    expect(releaseElectrobun).toContain(
      "if bun run lifeops:browser:package:release; then",
    );
    expect(releaseElectrobun).toContain("name: lifeops-browser-store-bundles");
    expect(releaseElectrobun).toContain(
      "name: Publish LifeOps Browser companions",
    );
    expect(releaseElectrobun).toContain(
      "name: Attach LifeOps Browser assets to GitHub release",
    );
    expect(releaseElectrobun).toContain("pattern: lifeops-browser-*");
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
    expect(fallbackScript).toContain(
      "symlink_installed_packages_into_manifest_node_modules",
    );
  });

  it("patches generated Android files before the release Gradle build", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain("Aligned generated Android Gradle wrapper");
    expect(agentRelease).toContain(
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    );
  });

  it("reuses release-installed Electrobun workspaces during packaging", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

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
  });

  it("keeps draft Electrobun validation moving when a built app tree exists", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

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
  });
});
