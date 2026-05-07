import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";

function readJson(path: string) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

function assertNoElizaWorkspaceSpecifiers(
  packageJsonPath: string,
  scopes = ["@elizaos/", "@clawville/"],
) {
  const pkg = readJson(packageJsonPath);
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "overrides",
  ]) {
    for (const [name, specifier] of Object.entries(pkg[section] ?? {})) {
      if (!scopes.some((scope) => name.startsWith(scope))) continue;
      assert.notEqual(
        specifier,
        "workspace:*",
        `${packageJsonPath} ${section}.${name} must not point at a local elizaOS workspace`,
      );
    }
  }
}

test("Milady no longer tracks eliza as a submodule", () => {
  assert.equal(fs.existsSync(".gitmodules"), false);
  assert.match(read(".gitignore"), /^\/eliza\/$/m);

  const rootPackage = readJson("package.json");
  assert.deepEqual(rootPackage.workspaces, ["apps/*"]);
  assert.equal(rootPackage.scripts.preinstall, undefined);
  assert.equal(
    rootPackage.scripts["setup:upstreams"],
    "node scripts/eliza-source-mode.mjs local --install",
  );
});

test("package manifests default to published elizaOS alpha packages", () => {
  for (const packageJsonPath of [
    "package.json",
    "apps/app/package.json",
    "apps/homepage/package.json",
  ]) {
    assertNoElizaWorkspaceSpecifiers(packageJsonPath);
  }

  const rootPackage = readJson("package.json");
  assert.equal(rootPackage.dependencies["@elizaos/app-core"], "alpha");
  assert.equal(rootPackage.dependencies["@elizaos/core"], "alpha");
  assert.equal(rootPackage.dependencies["@elizaos/agent"], "alpha");

  const appPackage = readJson("apps/app/package.json");
  assert.equal(
    appPackage.scripts.build,
    "node ../../scripts/run-app-web-build.mjs",
  );
  assert.equal(
    read("apps/app/scripts/build.mjs"),
    '#!/usr/bin/env node\n\nimport "../../../scripts/run-app-web-build.mjs";\n',
  );
  assert.doesNotMatch(
    rootPackage.scripts["build:ios"],
    /MILADY_ELIZA_SOURCE=local/,
  );
  assert.doesNotMatch(
    appPackage.scripts["build:ios"],
    /MILADY_ELIZA_SOURCE=local/,
  );
  assert.equal(appPackage.dependencies["@elizaos/app-core"], "alpha");
  assert.equal(appPackage.dependencies["@elizaos/shared"], "alpha");

  for (const packageName of [
    "@elizaos/capacitor-agent",
    "@elizaos/capacitor-appblocker",
    "@elizaos/capacitor-camera",
    "@elizaos/capacitor-canvas",
    "@elizaos/capacitor-contacts",
    "@elizaos/capacitor-gateway",
    "@elizaos/capacitor-location",
    "@elizaos/capacitor-messages",
    "@elizaos/capacitor-mobile-signals",
    "@elizaos/capacitor-phone",
    "@elizaos/capacitor-screencapture",
    "@elizaos/capacitor-swabble",
    "@elizaos/capacitor-system",
    "@elizaos/capacitor-talkmode",
    "@elizaos/capacitor-websiteblocker",
  ]) {
    assert.equal(
      appPackage.dependencies[packageName],
      "1.0.0",
      `${packageName} must resolve from npm for Capacitor package mode`,
    );
  }
  assert.equal(appPackage.dependencies["@elizaos/capacitor-llama"], "0.1.0");
});

test("root build resolves app-core entries from packages by default", () => {
  const helper = read("scripts/lib/eliza-package-mode.mjs");
  const resolver = read("scripts/lib/resolve-eliza-app-core-script.mjs");
  const tsdownConfig = read("tsdown.config.mjs");

  assert.match(helper, /DEFAULT_ELIZA_SOURCE_MODE = "packages"/);
  assert.match(read("scripts/run-app-web-build.mjs"), /isLocalElizaDisabled/);
  assert.match(
    read("scripts/run-app-web-build.mjs"),
    /patch-elizaos-app-core-native-browser-package\.mjs/,
  );
  assert.match(read("scripts/run-app-web-build.mjs"), /vite\.js", "build"/);
  assert.match(resolver, /preferLocal && existsSync/);
  assert.match(tsdownConfig, /"packages"/);
  assert.match(tsdownConfig, /require\.resolve\(packageSubpath\)/);
  assert.doesNotMatch(tsdownConfig, /entry:\s*["']eliza\/packages\/app-core/);
});

test("app TypeScript aliases do not prefer the local eliza checkout", () => {
  for (const tsconfigPath of [
    "apps/app/tsconfig.json",
    "apps/homepage/tsconfig.json",
  ]) {
    const source = read(tsconfigPath);
    assert.doesNotMatch(source, /"\.\/eliza\//);
    assert.doesNotMatch(source, /"\.\.\/\.\.\/eliza\//);
  }

  const appTsconfig = readJson("apps/app/tsconfig.json");
  assert.deepEqual(appTsconfig.compilerOptions.paths["@elizaos/app-core"], [
    "./node_modules/@elizaos/app-core",
  ]);
  assert.deepEqual(appTsconfig.compilerOptions.paths["@elizaos/app-lifeops"], [
    "./apps/app/src/optional-eliza-app-stub.tsx",
  ]);
  assert.deepEqual(
    appTsconfig.compilerOptions.paths["@elizaos/capacitor-agent"],
    ["./apps/app/src/native-plugin-stubs.ts"],
  );
});

test("vite only uses local eliza when local source mode is explicit", () => {
  const viteConfig = read("apps/app/vite.config.ts");

  assert.match(viteConfig, /function shouldUseLocalElizaSource/);
  assert.match(viteConfig, /MILADY_ELIZA_SOURCE/);
  assert.match(viteConfig, /"packages"/);
  assert.match(viteConfig, /optionalElizaAppStubEntry/);
  assert.match(viteConfig, /nativePluginStubEntry/);
});

test("optional app stubs satisfy route plugin and runtime hook imports", () => {
  const stubScript = read("scripts/ensure-elizaos-optional-app-stubs.mjs");

  assert.match(stubScript, /isLocalElizaDisabled/);
  assert.match(stubScript, /local elizaOS source mode; skipping stubs/);

  for (const packageName of [
    "@elizaos/app-hyperliquid",
    "@elizaos/app-knowledge",
    "@elizaos/app-polymarket",
    "@elizaos/app-shopify",
    "@elizaos/app-steward",
    "@elizaos/app-training",
    "@elizaos/app-vincent",
    "@elizaos/app-wallet",
  ]) {
    assert.match(stubScript, new RegExp(packageName.replace("/", "\\/")));
  }

  for (const exportName of [
    "hyperliquidPlugin",
    "knowledgePlugin",
    "polymarketPlugin",
    "shopifyPlugin",
    "stewardPlugin",
    "trainingPlugin",
    "vincentPlugin",
    "registerTrainingRuntimeHooks",
  ]) {
    assert.match(stubScript, new RegExp(`export .*${exportName}`));
  }
});

test("elizaOS package channel is configurable instead of alpha-only", () => {
  const helper = read("scripts/lib/eliza-package-mode.mjs");
  const disableScript = read("scripts/disable-local-eliza-workspace.mjs");
  const setupScript = read("scripts/setup-upstreams.mjs");
  const fallbackDeps = read(
    "scripts/install-published-workspace-fallback-deps.sh",
  );

  assert.match(helper, /DEFAULT_ELIZAOS_PACKAGE_DIST_TAG = "alpha"/);
  assert.match(helper, /MILADY_ELIZAOS_DIST_TAG/);
  assert.match(helper, /ELIZAOS_NPM_TAG/);
  assert.match(helper, /MILADY_ELIZAOS_VERSION/);
  assert.match(disableScript, /selectRegistryPackageVersion/);
  assert.doesNotMatch(disableScript, /\.alpha/);
  assert.match(setupScript, /getElizaosPackageSpecifier/);
  assert.doesNotMatch(setupScript, /FALLBACK_TAG = "alpha"/);
  assert.match(fallbackDeps, /ELIZAOS_PACKAGE_SPECIFIER/);
  assert.doesNotMatch(fallbackDeps, /@alpha/);
  assert.notEqual(
    fallbackDeps.indexOf('if [[ "$package_name" == @elizaos/* ]]; then'),
    -1,
  );
  assert.notEqual(fallbackDeps.indexOf('for manifest in "$@"; do'), -1);
  assert.ok(
    fallbackDeps.indexOf('if [[ "$package_name" == @elizaos/* ]]; then') <
      fallbackDeps.indexOf('for manifest in "$@"; do'),
  );
});

test("local eliza source clone target remains explicit and configurable", () => {
  const sourceModeScript = read("scripts/eliza-source-mode.mjs");
  const setupScript = read("scripts/setup-upstreams.mjs");
  const helper = read("scripts/lib/eliza-package-mode.mjs");

  assert.match(sourceModeScript, /local \[--install\]/);
  assert.match(setupScript, /getElizaGitUrl/);
  assert.match(setupScript, /getElizaGitBranch/);
  assert.match(helper, /MILADY_ELIZA_BRANCH/);
  assert.match(helper, /MILADY_ELIZA_GIT_URL/);
});

test("package-mode install repairs stale local node_modules links", () => {
  const sourceModeScript = read("scripts/eliza-source-mode.mjs");
  const postinstallScript = read("scripts/milady-postinstall-repo-setup.mjs");
  const repairScript = read("scripts/repair-elizaos-package-links.mjs");

  assert.doesNotMatch(sourceModeScript, /--ignore-scripts/);
  assert.match(postinstallScript, /repair-elizaos-package-links\.mjs/);
  assert.match(repairScript, /isLocalElizaDisabled/);
  assert.match(repairScript, /localElizaRoot/);
  assert.match(repairScript, /findBunStorePackage/);
});

test("package-mode no longer carries migrated elizaOS package patches", () => {
  const rootPackage = readJson("package.json");
  const postinstallScript = read("scripts/milady-postinstall-repo-setup.mjs");
  const appBuildScript = read("scripts/run-app-web-build.mjs");
  const productionBuildScript = read("scripts/run-production-build.mjs");
  const migratedPatchScripts = [
    "patch-elizaos-package-esm-imports.mjs",
    "patch-elizaos-capacitor-agent-package.mjs",
  ];

  for (const scriptName of migratedPatchScripts) {
    assert.equal(fs.existsSync(`scripts/${scriptName}`), false);
    assert.ok(!rootPackage.files.includes(`scripts/${scriptName}`));
    const scriptPattern = new RegExp(scriptName.replaceAll(".", "\\."));
    assert.doesNotMatch(postinstallScript, scriptPattern);
    assert.doesNotMatch(appBuildScript, scriptPattern);
    assert.doesNotMatch(productionBuildScript, scriptPattern);
  }
});

test("root tsconfig.json is packages-mode-clean by default", () => {
  const tsconfigSource = read("tsconfig.json");
  assert.doesNotMatch(
    tsconfigSource,
    /"\.\/eliza\//,
    "root tsconfig.json must not reference ./eliza/ paths in packages mode",
  );
  assert.doesNotMatch(
    tsconfigSource,
    /"eliza\/(packages|plugins|test|apps)\//,
    "root tsconfig.json include/exclude must not reference eliza/ subpaths in packages mode",
  );

  const tsconfig = readJson("tsconfig.json");
  assert.deepEqual(tsconfig.compilerOptions.paths["@elizaos/app-core"], [
    "./node_modules/@elizaos/app-core",
  ]);
  assert.deepEqual(tsconfig.compilerOptions.paths["@elizaos/core"], [
    "./node_modules/@elizaos/core",
  ]);
  assert.deepEqual(tsconfig.compilerOptions.paths["@elizaos/shared"], [
    "./node_modules/@elizaos/shared",
  ]);
});

test("checked-in tsconfig.json matches the packages-mode template byte-for-byte", () => {
  const checkedIn = read("tsconfig.json").replace(/\n+$/, "");
  const template = read(
    "scripts/templates/tsconfig.packages-mode.json",
  ).replace(/\n+$/, "");
  assert.equal(
    checkedIn,
    template,
    "tsconfig.json must match scripts/templates/tsconfig.packages-mode.json (run `bun run eliza:packages` to sync)",
  );
});

test("local-mode tsconfig template prefers source paths and includes eliza tree", () => {
  const localTemplate = read("scripts/templates/tsconfig.local-mode.json");
  const localJson = JSON.parse(localTemplate);
  assert.deepEqual(localJson.compilerOptions.paths["@elizaos/app-core"], [
    "./eliza/packages/app-core/src/index.ts",
    "./node_modules/@elizaos/app-core",
  ]);
  assert.ok(
    localJson.include.includes("eliza/packages/app-core/src/**/*"),
    "local-mode tsconfig must include the eliza app-core source tree",
  );
});

test("eject and uneject scripts wire the tsconfig-mode helper", () => {
  const disableScript = read("scripts/disable-local-eliza-workspace.mjs");
  const restoreScript = read("scripts/restore-local-eliza-workspace.mjs");
  assert.match(disableScript, /applyTsconfigMode\(repoRoot, "packages"/);
  assert.match(restoreScript, /applyTsconfigMode\(repoRoot, "local"/);
});
