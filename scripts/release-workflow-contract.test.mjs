import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const workflow = (name) => fs.readFileSync(`.github/workflows/${name}`, "utf8");
const localElectrobunStagerPath =
  "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh";

test("canonical release workflow owns channel routing", () => {
  const release = workflow("agent-release.yml");

  assert.match(release, /^name: Release$/m);
  assert.match(release, /channel:\n\s+description: "Release channel"/);
  for (const channel of ["canary", "beta", "rc", "stable"]) {
    assert.match(release, new RegExp(`- ${channel}`));
  }
  assert.match(release, /NPM_DIST_TAG="canary"/);
  assert.match(release, /NPM_DIST_TAG="beta"/);
  assert.match(release, /NPM_DIST_TAG="rc"/);
  assert.match(release, /NPM_DIST_TAG="latest"/);
  assert.match(
    release,
    /channel: \$\{\{ needs\.version\.outputs\.channel \}\}/,
  );
  assert.match(
    release,
    /publish_packages: \$\{\{ needs\.version\.outputs\.channel != 'canary' \}\}/,
  );
});

test("canonical release workflow default permissions cover release graph", () => {
  const release = workflow("agent-release.yml");

  assert.match(
    release,
    /^permissions:\n\s+contents: write\n\s+issues: write\n\s+packages: write\n\s+id-token: write\n\s+pages: write\n\s+pull-requests: read/m,
  );
});

test("canonical release workflow grants reusable workflow permissions", () => {
  const release = workflow("agent-release.yml");

  for (const jobName of [
    "build-docker",
    "build-cloud-image",
    "push-agent-image",
    "push-cloud-image",
  ]) {
    assert.match(
      release,
      new RegExp(
        `${jobName}:[\\s\\S]*?permissions:\\n\\s+contents: read\\n\\s+packages: write\\n\\s+id-token: write[\\s\\S]*?uses: \\.\\/\\.github\\/workflows\\/(?:build-docker|build-cloud-image)\\.yml`,
      ),
    );
  }

  assert.match(
    release,
    /build-electrobun:[\s\S]*?permissions:\n\s+contents: write\n\s+packages: write[\s\S]*?uses: \.\/\.github\/workflows\/release-electrobun\.yml/,
  );

  assert.match(
    release,
    /distribute-release:[\s\S]*?permissions:\n\s+contents: write\n\s+packages: write\n\s+id-token: write\n\s+pages: write[\s\S]*?uses: \.\/\.github\/workflows\/release-orchestrator\.yml/,
  );
});

test("distribution workflows consume the canonical channel policy", () => {
  const orchestrator = workflow("release-orchestrator.yml");
  const publishPackages = workflow("publish-packages.yml");
  const publishNpm = workflow("publish-npm.yml");
  const electrobun = workflow("release-electrobun.yml");

  assert.match(orchestrator, /channel:\n\s+description: "Release channel/);
  assert.match(orchestrator, /NPM_DIST_TAG="canary"/);
  assert.match(orchestrator, /SNAP_RELEASE="edge"/);
  assert.match(
    orchestrator,
    /canary distribution requires an alpha\/nightly version/,
  );
  assert.match(
    orchestrator,
    /snap_release: \$\{\{ needs\.prepare\.outputs\.snap_release \}\}/,
  );

  assert.match(publishPackages, /snap_release:/);
  assert.match(
    publishPackages,
    /release: \$\{\{ needs\.prepare\.outputs\.snap_release \}\}/,
  );
  assert.doesNotMatch(publishPackages, /edge,beta|stable,candidate/);

  assert.match(publishNpm, /DIST_TAG="canary"/);
  assert.match(publishNpm, /DIST_TAG="rc"/);

  assert.match(electrobun, /channel:\n\s+description: "Release channel/);
  assert.match(
    electrobun,
    /git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza/,
  );
  assert.match(
    electrobun,
    /\n\s+build:\n\s+name: Build \$\{\{ matrix\.platform\.name \}\}[\s\S]*?name: Initialize eliza source checkout[\s\S]*?git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza[\s\S]*?name: Initialize tracked workspace submodules/,
  );
  assert.match(
    electrobun,
    /\$HOME\/\.cache\/eliza\/whisper\/ggml-base\.en\.bin/,
  );
  assert.match(electrobun, /node scripts\/align-eliza-agent-package-pins\.mjs/);
  assert.match(
    electrobun,
    /bun install --cwd eliza --no-frozen-lockfile --ignore-scripts/,
  );
  assert.match(electrobun, /eliza\/packages\/browser-bridge\/dist\/artifacts/);
  assert.match(
    electrobun,
    /name: Package Agent Browser Bridge release bundles[\s\S]*?bun run browser-bridge:package:release[\s\S]*?packaged=true/,
  );
  assert.doesNotMatch(
    electrobun,
    /Agent Browser Bridge packaging failed|continue without browser companion bundles/,
  );
  assert.match(
    electrobun,
    /workflow_dispatch:[\s\S]*?tag:\n\s+description: "Release tag \(e\.g\. v2\.0\.0-alpha\.3\)"\n\s+required: true/,
  );
  assert.match(electrobun, /beta desktop release requires a beta version/);
  assert.match(electrobun, /BUILD_ENV="stable"/);
});

test("cloud image build stages Milady app into Dockerfile layout", () => {
  const cloudImage = workflow("build-cloud-image.yml");

  assert.match(
    cloudImage,
    /git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza/,
  );
  assert.match(
    cloudImage,
    /bun install --cwd eliza --no-frozen-lockfile --ignore-scripts/,
  );
  assert.match(
    cloudImage,
    /export PATH="\$GITHUB_WORKSPACE\/eliza\/node_modules\/\.bin:\$GITHUB_WORKSPACE\/eliza\/packages\/schemas\/node_modules\/\.bin:\$PATH"/,
  );
  assert.match(cloudImage, /node scripts\/apply-eliza-ci-patches\.mjs/);
  assert.match(cloudImage, /cloud-image-prune-deps\.mjs/);
  assert.doesNotMatch(cloudImage, /RUN node - <<'EOF'/);
  assert.match(cloudImage, /git show HEAD:bun\.lock > bun\.lock/);
  assert.doesNotMatch(
    cloudImage,
    /git submodule update --init --depth=1 eliza/,
  );
  assert.match(
    cloudImage,
    /cp apps\/app\/package\.json packages\/app\/package\.json/,
  );
  assert.match(cloudImage, /cp -R apps\/app\/dist packages\/app\/dist/);
  assert.match(cloudImage, /test -f packages\/app\/package\.json/);
  assert.match(cloudImage, /test -d packages\/app\/dist/);
  assert.match(cloudImage, /cp -R eliza\/cloud\/packages\/sdk cloud-sdk/);
  assert.match(cloudImage, /test -f cloud-sdk\/package\.json/);
});

test("release workflows skip eliza install lifecycle scripts", () => {
  for (const name of [
    "build-cloud-image.yml",
    "build-docker.yml",
    "release-electrobun.yml",
  ]) {
    const text = workflow(name);
    assert.match(
      text,
      /bun install --cwd eliza --no-frozen-lockfile --ignore-scripts/,
    );
    assert.doesNotMatch(
      text,
      /bun install --cwd eliza --no-frozen-lockfile(?! --ignore-scripts)/,
    );
  }
});

test("release workflows hydrate eliza Bun after ignored nested install", () => {
  for (const name of [
    "build-cloud-image.yml",
    "build-docker.yml",
    "release-electrobun.yml",
  ]) {
    const text = workflow(name);
    assert.match(
      text,
      /name: Install eliza source dependencies[\s\S]*?bun install --cwd eliza --no-frozen-lockfile --ignore-scripts[\s\S]*?name: Hydrate eliza Bun package postinstall[\s\S]*?run: cd eliza\/node_modules\/bun && node install\.js/,
    );
  }
});

test("release workflows use upstream elizaOS source", () => {
  for (const name of [
    "agent-release.yml",
    "build-cloud-image.yml",
    "build-docker.yml",
    "release-electrobun.yml",
    "reusable-npm-publish.yml",
    "test-electrobun-release.yml",
  ]) {
    const text = workflow(name);
    assert.match(text, /https:\/\/github\.com\/elizaOS\/eliza\.git/);
    assert.doesNotMatch(text, /github\.com\/milady-ai\/eliza\.git/);
  }
});

test("eliza CI patches align release source helpers", () => {
  const patchScript = fs.readFileSync(
    "scripts/apply-eliza-ci-patches.mjs",
    "utf8",
  );
  const pruneScript = fs.readFileSync(
    "scripts/cloud-image-prune-deps.mjs",
    "utf8",
  );

  assert.match(
    patchScript,
    /"@elizaos\/agent\/runtime\/release-plugin-policy\.js"[\s\S]*"@elizaos\/agent\/runtime\/release-plugin-policy"/,
  );
  assert.match(
    patchScript,
    /COPY scripts\/cloud-image-prune-deps\.mjs \.\/scripts\/cloud-image-prune-deps\.mjs\\nRUN bun scripts\/cloud-image-prune-deps\.mjs/,
  );
  assert.match(patchScript, /COPY patches \.\/patches/);
  assert.match(patchScript, /COPY cloud-sdk \.\/eliza\/cloud\/packages\/sdk/);
  assert.match(patchScript, /build-patched-electrobun-cli\.mjs/);
  assert.match(patchScript, /require\.resolve\("rcedit\/package\.json"\)/);
  assert.match(patchScript, /replace\(\/\\r\\n\/g, "\\n"\)/);
  assert.match(patchScript, /smoke-test-windows\.ps1/);
  assert.match(patchScript, /smoke-test\.sh/);
  assert.doesNotMatch(patchScript, /milady-1/);
  assert.match(patchScript, /pglite-" \+ \[Guid\]::NewGuid/);
  assert.match(
    patchScript,
    /type StructuredResponseFormat = "JSON";[\s\S]*type StructuredResponseFormat = "JSON" \| "TOON";/,
  );
  assert.match(patchScript, /format: "JSON";[\s\S]*format: "JSON" \| "TOON";/);
  assert.match(patchScript, /shouldHoistRuntimePackage/);
  assert.match(patchScript, /name\.startsWith\("@solana\/"\)/);
  assert.match(
    patchScript,
    /"@elizaos\/core", "commander"[\s\S]*runtime copy tar-safe Solana hoists/,
  );
  assert.match(patchScript, /alpha\|beta\|rc\|nightly/);
  assert.match(patchScript, /browser bridge canary release versions/);
  assert.match(patchScript, /Agent-Browser-Bridge/);
  assert.ok(patchScript.includes("Agent-Browser-Bridge\\\\.Extension"));
  assert.match(patchScript, /browser bridge Safari bundle identifiers/);
  assert.match(patchScript, /app-core release browser bridge hard gate/);
  assert.match(patchScript, /nestedElizaPackageJson/);
  assert.match(patchScript, /collectWorkspaceMaps\(\s*elizaRoot/);
  assert.match(patchScript, /patchCorePluginRuntimeSurface/);
  assert.match(patchScript, /agent core plugin runtime surface/);
  assert.match(patchScript, /patchN8nAutoEnableDefault/);
  assert.match(patchScript, /n8nConfig\?\.localEnabled === true/);
  assert.match(patchScript, /patchN8nCharacterKnowledge/);
  assert.match(patchScript, /\/\\\$defaultAvatarAssetSlugs\\s\*=\\s\*@/);
  assert.match(patchScript, /DEFAULT_AVATAR_ASSET_SLUGS=\\\(\[\^\)\]\*\\\)/);
  assert.match(patchScript, /DEFAULT_AVATAR_ASSET_SLUGS=\(eliza-1\)/);
  assert.match(
    pruneScript,
    /plugin-agent-orchestrator\|plugin-app-control\|plugin-cli/,
  );
  assert.match(pruneScript, /PUBLISHED_RELEASE_DEPS/);
  assert.match(pruneScript, /"@elizaos\/plugin-elizacloud"/);
  assert.match(pruneScript, /ELIZAOS_PACKAGE_SPECIFIER/);
  assert.match(pruneScript, /"@elizaos\/cloud-sdk"/);
  assert.match(pruneScript, /file:\.\/eliza\/cloud\/packages\/sdk/);
});

test("release jobs hydrate eliza source without a root eliza gitlink", () => {
  const release = workflow("agent-release.yml");
  const buildDocker = workflow("build-docker.yml");

  assert.match(
    release,
    /git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza/,
  );
  assert.doesNotMatch(release, /git submodule sync -- eliza/);
  assert.doesNotMatch(release, /git submodule update --init --depth=1 eliza/);
  assert.match(
    buildDocker,
    /name: Apply elizaOS source CI patches[\s\S]*?run: node scripts\/apply-eliza-ci-patches\.mjs[\s\S]*?name: Repair known eliza patch files/,
  );
});

test("release docs validation tracks current eliza docs package layout", () => {
  const release = workflow("agent-release.yml");

  assert.match(release, /eliza\/packages\/docs\/docs\.json/);
  assert.match(release, /find eliza\/packages\/docs -name '\*\.md'/);
  assert.doesNotMatch(release, /eliza\/docs\/docs\.json/);
});

test("npm release builds generate gitignored eliza i18n data before bundling", () => {
  const release = workflow("agent-release.yml");
  const reusableNpmPublish = workflow("reusable-npm-publish.yml");
  const releaseContractSuite = fs.readFileSync(
    "scripts/run-release-contract-suite.mjs",
    "utf8",
  );

  for (const content of [release, reusableNpmPublish]) {
    assert.match(
      content,
      /git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza/,
    );
    assert.match(
      content,
      /node scripts\/run-eliza-app-core-script\.mjs ensure-shared-i18n-data\.mjs[\s\S]*?bunx tsdown/,
    );
  }
  assert.match(
    releaseContractSuite,
    /ensure-shared-i18n-data\.mjs"[\s\S]*?run\("bunx", \["tsdown"/,
  );
});

test("Electrobun release exposes whisper-node for upstream script layout", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(
    electrobun,
    /name: Expose whisper-node for eliza Electrobun scripts/,
  );
  assert.match(electrobun, /req\.resolve\("whisper-node\/package\.json"\)/);
  assert.match(
    electrobun,
    /ln -sfn "\$\(realpath "\$whisper_pkg"\)" eliza\/packages\/node_modules\/whisper-node/,
  );
});

test("Electrobun release uses Milady whisper cache path", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /~\/\.cache\/milady\/whisper/);
  assert.match(
    electrobun,
    /\$HOME\/\.cache\/milady\/whisper\/ggml-base\.en\.bin/,
  );
  assert.match(
    electrobun,
    /eliza\/packages\/node_modules\/whisper-node\/lib\/whisper\.cpp\/models\/ggml-base\.en\.bin/,
  );
});

test("Electrobun release applies elizaOS source overlay before manual build setup", () => {
  const electrobun = workflow("release-electrobun.yml");
  const copyRuntimeWrapper = fs.readFileSync(
    "scripts/copy-runtime-node-modules.ts",
    "utf8",
  );

  assert.match(
    electrobun,
    /name: Apply elizaOS source CI patches[\s\S]*?run: node scripts\/apply-eliza-ci-patches\.mjs[\s\S]*?name: Setup Bun/,
  );
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/build-patched-electrobun-cli\.mjs "\$\{\{ steps\.resolve-electrobun\.outputs\.package-dir \}\}" "\$\{\{ matrix\.platform\.artifact-name \}\}"/,
  );
  assert.match(
    electrobun,
    /name: Probe Electrobun bun entry build[\s\S]*?node "\$GITHUB_WORKSPACE\/scripts\/copy-runtime-node-modules\.ts" --link-only[\s\S]*?bun build src\/index\.ts --target=bun/,
  );
  assert.match(copyRuntimeWrapper, /elizaElectrobunNodeModules/);
  assert.match(
    copyRuntimeWrapper,
    /elizaAppCoreDir,\s*"platforms",\s*"electrobun"/,
  );
});

test("Electrobun Windows release runs packaged Playwright check after disk cleanup", () => {
  const electrobun = workflow("release-electrobun.yml");
  const rootPackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const hydrateScript = fs.readFileSync(
    "scripts/hydrate-windows-playwright-deps.mjs",
    "utf8",
  );

  assert.match(
    electrobun,
    /name: Free disk space before Windows smoke test[\s\S]*?name: Reapply Windows smoke asset patch[\s\S]*?run: node scripts\/apply-eliza-ci-patches\.mjs[\s\S]*?name: Smoke test packaged Windows app/,
  );
  assert.match(
    electrobun,
    /node scripts\/ensure-eliza-renderer-avatar-assets\.mjs[\s\S]*?test -f apps\/app\/dist\/vrms\/eliza-1\.vrm\.gz -o -f apps\/app\/dist\/vrms\/eliza-1\.vrm/,
  );
  assert.match(
    electrobun,
    /name: Run Windows packaged renderer bootstrap check[\s\S]*?run: bun run test:desktop:playwright:windows/,
  );
  assert.match(
    rootPackage.scripts["test:desktop:playwright:windows"],
    /node scripts\/hydrate-windows-playwright-deps\.mjs && cd apps\/app &&/,
  );
  assert.match(hydrateScript, /@playwright\/test@1\.59\.1/);
  assert.match(hydrateScript, /@elizaos\/plugin-elizacloud/);
  assert.match(hydrateScript, /@elizaos\/cloud-sdk/);
  assert.match(hydrateScript, /@elizaos\/core/);
  assert.match(hydrateScript, /@elizaos\/plugin-sql/);
  assert.match(hydrateScript, /plugins", "plugin-sql/);
  assert.match(hydrateScript, /sqlPluginTypescriptPath = path\.join/);
  assert.match(hydrateScript, /sqlPluginPath,\s*"typescript"/);
  assert.match(hydrateScript, /copy: true/);
  assert.match(hydrateScript, /packageEntryCandidates/);
  assert.match(hydrateScript, /assertPackageRuntimeEntry/);
  assert.match(hydrateScript, /selectRuntimePackageRoot/);
  assert.match(hydrateScript, /using installed \$\{scopedPackageName\}/);
  assert.match(hydrateScript, /dist\/index\.node\.js/);
  assert.match(hydrateScript, /dist\/node\/index\.node\.js/);
  assert.match(hydrateScript, /linkElizaPackage/);
  assert.match(hydrateScript, /linkScopedPackage/);
  assert.match(hydrateScript, /symlinkSync/);
  assert.match(hydrateScript, /junction/);
  assert.doesNotMatch(
    hydrateScript,
    /@elizaos\/plugin-elizacloud@\$\{?elizaPackageSpecifier/,
  );
  assert.doesNotMatch(hydrateScript, /elizaPackageSpecifier/);
  assert.match(
    rootPackage.scripts["test:desktop:playwright:windows"],
    /bunx playwright test --config playwright\.electrobun\.packaged\.config\.ts/,
  );
  assert.match(
    electrobun,
    /name: Run Windows packaged renderer bootstrap check[\s\S]*?PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"[\s\S]*?run: bun run test:desktop:playwright:windows/,
  );
});

test("package-mode production build reapplies native app-core patch before Vite", () => {
  const productionBuild = fs.readFileSync(
    "scripts/run-production-build.mjs",
    "utf8",
  );
  const nativePatch = fs.readFileSync(
    "scripts/patch-elizaos-app-core-native-browser-package.mjs",
    "utf8",
  );

  assert.match(
    productionBuild,
    /tsdownCli[\s\S]*patch-elizaos-app-core-native-browser-package\.mjs[\s\S]*viteCli/,
  );
  assert.match(nativePatch, /node_modules", "\.bun"/);
  assert.match(nativePatch, /entry\.startsWith\("@elizaos\+app-core@"/);
  assert.match(nativePatch, /app-shell-components/);
  assert.match(nativePatch, /registerAppShellPage/);
  assert.match(nativePatch, /eliza",\s*"packages",\s*"app-core"/);
});

test("Electrobun macOS release keeps one command path for both CPU architectures", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /"artifact-name"\s*:\s*"macos-arm64"/);
  assert.match(electrobun, /"artifact-name"\s*:\s*"macos-x64"/);
  assert.doesNotMatch(electrobun, /arch -x86_64/);
  assert.doesNotMatch(electrobun, /ELIZA_DESKTOP_COMMAND_PREFIX/);
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/desktop-build\.mjs stage --variant=base --build-whisper/,
  );
  assert.match(
    electrobun,
    /node eliza\/packages\/app-core\/scripts\/desktop-build\.mjs package --env=\$\{\{ needs\.prepare\.outputs\.env \}\}/,
  );
});

test("Electrobun macOS release patch signs nested native runtime binaries idempotently", () => {
  const patchScript = fs.readFileSync(
    "scripts/patch-eliza-electrobun-windows-smoke-startup.mjs",
    "utf8",
  );

  assert.match(patchScript, /sign_nested_macos_runtime_targets\(\)/);
  assert.match(
    patchScript,
    /runtime_resources_dir="\$STAGED_APP_PATH\/Contents\/Resources\/app\/eliza-dist"/,
  );
  assert.match(patchScript, /find "\$runtime_resources_dir" -type f -print0/);
  assert.match(patchScript, /file "\$candidate_path"/);
  assert.match(patchScript, /Mach-O/);
  assert.match(patchScript, /text\.includes\('for tarball_pattern in/);
});

test.skipIf(!fs.existsSync(localElectrobunStagerPath))(
  "Electrobun macOS release patch tolerates CRLF stager checkout",
  () => {
    const tmpRepo = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-release-patch-"),
    );
    try {
      const copyRepoFile = (relativePath) => {
        const destination = path.join(tmpRepo, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(relativePath, destination);
      };

      copyRepoFile("scripts/patch-eliza-electrobun-windows-smoke-startup.mjs");
      for (const relativePath of [
        "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts",
        "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
        "eliza/packages/app-core/platforms/electrobun/src/native/steward.ts",
        "eliza/packages/agent/src/services/telegram-account-auth.ts",
        "eliza/packages/app-core/test/helpers/real-runtime.ts",
        "eliza/packages/app-core/platforms/electrobun/scripts/local-adhoc-sign-macos.ts",
      ]) {
        copyRepoFile(relativePath);
      }

      const stagerPath = path.join(
        tmpRepo,
        "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
      );
      fs.mkdirSync(path.dirname(stagerPath), { recursive: true });
      const cleanStager = fs.readFileSync(
        "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
        { encoding: "utf8" },
      );
      fs.writeFileSync(stagerPath, cleanStager.replace(/\r?\n/g, "\r\n"));

      execFileSync(
        process.execPath,
        ["scripts/patch-eliza-electrobun-windows-smoke-startup.mjs"],
        { cwd: tmpRepo, stdio: "pipe" },
      );

      const patchedStager = fs.readFileSync(stagerPath, "utf8");
      assert.match(patchedStager, /retry_codesign\(\) \{/);
      assert.match(
        patchedStager,
        /for tarball_pattern in "\*-macos-\*\.app\.tar\.zst"/,
      );
      assert.match(patchedStager, /sign_nested_macos_runtime_targets\(\) \{/);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  },
);

test("Electrobun release has a lightweight PR contract workflow", () => {
  const workflowText = workflow("test-electrobun-release.yml");

  assert.match(workflowText, /^name: Validate Electrobun Release Workflow$/m);
  assert.match(workflowText, /branches: \[main, develop\]/);
  assert.match(workflowText, /BUN_VERSION: "1\.3\.13"/);
  assert.match(workflowText, /MILADY_SKIP_LOCAL_UPSTREAMS: "1"/);
  assert.match(
    workflowText,
    /git clone --depth=1 --branch "\$\{MILADY_ELIZA_BRANCH:-develop\}" https:\/\/github\.com\/elizaOS\/eliza\.git eliza/,
  );
  assert.match(
    workflowText,
    /run: bun run test:regression-matrix:release-contract/,
  );
  assert.match(workflowText, /run: bun run test:release:contract/);
  assert.match(workflowText, /SKIP_AVATAR_CLONE: "1"/);
  assert.match(workflowText, /ELIZA_NO_VISION_DEPS: "1"/);
  assert.match(workflowText, /MILADY_NO_VISION_DEPS: "1"/);
});

test("Electrobun release workflow root bun scripts are wired", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = [
    "test:regression-matrix:release",
    "test:regression-matrix:release-contract",
    "test:e2e:heavy",
    "test:live:cloud",
    "browser-bridge:package:release",
    "test:desktop:packaged",
    "test:desktop:packaged:windows",
    "test:desktop:playwright",
  ];

  for (const scriptName of requiredScripts) {
    assert.ok(scripts[scriptName], `package.json missing ${scriptName}`);
  }
  assert.equal(
    scripts["test:regression-matrix:release-contract"],
    "node scripts/run-eliza-app-core-script.mjs validate-regression-matrix.mjs --workflow release-contract",
  );
});

test("GitHub workflows use the verified Bun runtime", () => {
  const workflowDir = ".github/workflows";
  const workflowFiles = fs
    .readdirSync(workflowDir)
    .filter((fileName) => fileName.endsWith(".yml"));

  for (const fileName of workflowFiles) {
    const workflowText = fs.readFileSync(
      path.join(workflowDir, fileName),
      "utf8",
    );
    assert.doesNotMatch(workflowText, /BUN_VERSION:\s*"1\.3\.1[01]"/);
    assert.doesNotMatch(workflowText, /bun-version:\s*"?1\.3\.1[01]"?/);
  }
});

test("GitHub workflows and composite actions use current Node action majors", () => {
  const actionFiles = [
    ...fs
      .readdirSync(".github/workflows")
      .filter((fileName) => fileName.endsWith(".yml"))
      .map((fileName) => path.join(".github/workflows", fileName)),
    ...fs
      .readdirSync(".github/actions", { recursive: true })
      .filter((fileName) => String(fileName).endsWith(".yml"))
      .map((fileName) => path.join(".github/actions", String(fileName))),
  ];

  for (const actionFile of actionFiles) {
    const workflowText = fs.readFileSync(actionFile, "utf8");
    assert.doesNotMatch(workflowText, /actions\/checkout@v[1-5]\b/);
    assert.doesNotMatch(workflowText, /actions\/setup-node@v[1-5]\b/);
    assert.doesNotMatch(workflowText, /actions\/github-script@v[1-8]\b/);
    assert.doesNotMatch(workflowText, /actions\/cache@v[1-4]\b/);
    assert.doesNotMatch(workflowText, /actions\/setup-python@v[1-5]\b/);
    assert.doesNotMatch(workflowText, /docker\/setup-buildx-action@v[1-3]\b/);
    assert.doesNotMatch(workflowText, /docker\/login-action@v[1-3]\b/);
    assert.doesNotMatch(workflowText, /docker\/metadata-action@v[1-5]\b/);
    assert.doesNotMatch(workflowText, /docker\/build-push-action@v[1-6]\b/);
    assert.doesNotMatch(workflowText, /bufbuild\/buf-setup-action@/);
  }
});

test("E2E secret rotation workflow points at tracked scripts", () => {
  const rotate = workflow("rotate-e2e-secrets.yml");
  const scripts = [
    "scripts/rotate-e2e-secrets.mjs",
    "scripts/check-e2e-secrets-expiry.mjs",
  ];

  for (const scriptPath of scripts) {
    assert.ok(fs.existsSync(scriptPath), `${scriptPath} missing`);
    assert.match(rotate, new RegExp(`node ${scriptPath}`));
  }
  assert.match(rotate, /id: credentials/);
  assert.match(rotate, /steps\.credentials\.outputs\.available == 'true'/);
  assert.doesNotMatch(rotate, /bun run scripts\/(?:rotate|check)-e2e-secrets/);
});

test("Electrobun Windows smoke validates the public installer", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(electrobun, /ELIZA_WINDOWS_SMOKE_REQUIRE_INSTALLER: "1"/);
  assert.match(electrobun, /Smoke runs through the public installer/);
});

test("Electrobun unsigned macOS canaries skip Developer ID release checks", () => {
  const electrobun = workflow("release-electrobun.yml");

  assert.match(
    electrobun,
    /Verify macOS signature and notarization[\s\S]*?ELECTROBUN_SKIP_CODESIGN: \$\{\{ steps\.macos-keychain\.outputs\.skip_codesign \}\}/,
  );
  assert.match(electrobun, /require_developer_id=0/);
  assert.match(
    electrobun,
    /Unsigned macOS build: Developer ID, Gatekeeper, and stapler checks skipped/,
  );
  assert.match(
    electrobun,
    /Unsigned macOS build: Developer ID and stapler checks skipped/,
  );
});

test("npm package includes release script roots", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.ok(
    packageJson.files.includes("scripts/run-eliza-app-core-script.mjs"),
  );
  assert.ok(
    packageJson.files.includes("scripts/lib/resolve-eliza-app-core-script.mjs"),
  );
  assert.ok(
    packageJson.files.includes("scripts/generate-static-asset-manifest.mjs"),
  );
  assert.ok(packageJson.files.includes("scripts/init-submodules.mjs"));
  assert.ok(packageJson.files.includes("eliza/packages/app-core/scripts"));
});
