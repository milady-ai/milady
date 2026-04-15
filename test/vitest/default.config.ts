import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  coverageSummaryReporters,
  coverageThresholds,
} from "../../eliza/packages/app-core/scripts/coverage-policy.mjs";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getInstalledPackageEntry,
  getSharedSourceRoot,
  getUiSourceRoot,
} from "../eliza-package-paths";
import { repoRoot } from "./repo-root";
import {
  getAgentSourceAliases,
  getAppCoreBridgeStubPath,
  getAppCoreModuleFallbackPath,
  getAppCorePluginFallbackPath,
  getAppCoreSourceAliases,
  getElizaCoreRolesEntry,
  getOptionalPluginSdkAliases,
  getSharedSourceAliases,
  getUiSourceAliases,
  getWorkspaceAppAliases,
} from "./workspace-aliases";

const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const elizaCoreRolesEntry = getElizaCoreRolesEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const sharedSourceRoot = getSharedSourceRoot(repoRoot);
const uiSourceRoot = getUiSourceRoot(repoRoot);
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const elizaWorkspaceRequire = createRequire(
  path.join(repoRoot, "eliza", "package.json"),
);
const elizaReactEntry = elizaWorkspaceRequire.resolve("react");
const elizaReactDomEntry = elizaWorkspaceRequire.resolve("react-dom");
const elizaReactDir = path.dirname(elizaReactEntry);
const elizaReactDomDir = path.dirname(elizaReactDomEntry);
const workspacePluginPackageNames = Object.keys({
  ...(packageManifest.dependencies ?? {}),
  ...(packageManifest.devDependencies ?? {}),
})
  .filter((packageName) => packageName.startsWith("@elizaos/plugin-"))
  .sort();
const resolvedPluginNames = new Set<string>();
const elizaPluginAliases = workspacePluginPackageNames.flatMap(
  (packageName) => {
    const aliases: Array<{ find: string; replacement: string }> = [];
    const nodeEntry = getInstalledPackageEntry(packageName, repoRoot, "node");
    if (nodeEntry) {
      aliases.push({
        find: `${packageName}/node`,
        replacement: nodeEntry,
      });
    }

    const defaultEntry = getInstalledPackageEntry(packageName, repoRoot);
    if (defaultEntry) {
      resolvedPluginNames.add(packageName);
      aliases.push({
        find: packageName,
        replacement: defaultEntry,
      });
    }

    return aliases;
  },
);
// Fallback for @elizaos/plugin-* packages whose npm tarball has a broken or missing
// entry point (e.g. dist/index.js absent). Without this, vi.mock() factory
// calls still fail because vitest cannot resolve the module specifier.
const unresolvedPluginStubs = workspacePluginPackageNames
  .filter((name) => !resolvedPluginNames.has(name))
  .map((name) => ({
    find: name,
    replacement: path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "test",
      "stubs",
      "plugin-fallback-module.mjs",
    ),
  }));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = 2;
const ciWorkers = isWindows ? 2 : 3;
const appCoreModuleFallbackPath = getAppCoreModuleFallbackPath(repoRoot);
const appCoreBridgeStubPath = getAppCoreBridgeStubPath(repoRoot);
const appCorePluginFallbackPath = getAppCorePluginFallbackPath(repoRoot);

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "ethers", "@elizaos/core"],
    alias: [
      {
        // Pin React to one installed copy so jsdom tests don't mix the root
        // package with Bun's hoisted peer copies under nested workspaces.
        find: /^react$/,
        replacement: elizaReactEntry,
      },
      {
        find: /^react\/(.*)$/,
        replacement: path.join(elizaReactDir, "$1"),
      },
      {
        find: /^react-dom$/,
        replacement: elizaReactDomEntry,
      },
      {
        find: /^react-dom\/(.*)$/,
        replacement: path.join(elizaReactDomDir, "$1"),
      },
      {
        // App-core unit tests mock this plugin, but the specifier still has to
        // resolve during module graph construction under the root Vitest config.
        find: "@elizaos/capacitor-agent",
        replacement: appCoreModuleFallbackPath,
      },
      ...getOptionalPluginSdkAliases(repoRoot),
      // The `@elizaos/core/roles` alias is always applied — the shim
      // fallback in `scripts/lib/elizaos-core-roles-shim.js` is always
      // present, even when the local eliza checkout is absent (CI
      // published-only mode). Without this, vitest tries to resolve
      // the subpath via Node's normal package.json `exports` lookup
      // and fails with `ERR_MODULE_NOT_FOUND` because the published
      // `@elizaos/core@alpha` does not declare a `./roles` subpath.
      {
        find: "@elizaos/core/roles",
        replacement: elizaCoreRolesEntry,
      },
      {
        // plugin-plugin-manager is now built into @elizaos/core features.
        // Alias kept for backward compat with tests that still import the old package name.
        find: "@elizaos/plugin-plugin-manager",
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "typescript",
          "src",
          "features",
          "plugin-manager",
          "index.ts",
        ),
      },
      // Resolve key @elizaos packages to the installed npm tarball files so
      // Vitest does not depend on sibling workspace checkouts or package
      // export quirks.
      ...(elizaCoreEntry
        ? [
            {
              find: "@elizaos/core",
              replacement: elizaCoreEntry,
            },
            ...elizaPluginAliases.filter(
              (alias) => alias.find !== "@elizaos/plugin-plugin-manager",
            ),
            ...unresolvedPluginStubs.filter(
              (alias) => alias.find !== "@elizaos/plugin-plugin-manager",
            ),
          ]
        : []),
      ...(autonomousSourceRoot
        ? getAgentSourceAliases(autonomousSourceRoot)
        : getAgentSourceAliases(undefined, {
            // Stub @elizaos/agent sub-path imports when the package is absent
            // so transitive imports (e.g. contracts/wallet) don't break tests.
            fallbackReplacement: appCoreModuleFallbackPath,
          })),
      ...getAppCoreSourceAliases(appCoreSourceRoot, {
        bridgeReplacement: appCoreBridgeStubPath,
        fallbackReplacement: appCorePluginFallbackPath,
        stubRootSpecifier: true,
      }),
      ...getWorkspaceAppAliases(repoRoot, [
        "app-companion",
        "app-task-coordinator",
        "app-vincent",
        "app-shopify",
        "app-steward",
        "app-lifeops",
        "app-knowledge",
      ]),
      ...getSharedSourceAliases(sharedSourceRoot, {
        includeMiladyAlias: true,
      }),
      ...getUiSourceAliases(uiSourceRoot),
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: isCI ? 300_000 : isWindows ? 180_000 : 120_000,
    pool: "forks",
    maxWorkers: isCI ? ciWorkers : localWorkers,
    restoreMocks: true,
    // Increase V8 heap for worker forks to prevent OOM during GC
    // teardown, especially for jsdom-heavy test files.
    execArgv: ["--max-old-space-size=4096"],
    include: [
      "eliza/packages/agent/src/**/*.test.ts",
      "eliza/packages/agent/src/**/*.test.tsx",
      "eliza/packages/agent/test/**/*.test.ts",
      "eliza/packages/agent/test/**/*.test.tsx",
      "eliza/apps/*/test/**/*.test.ts",
      "eliza/apps/*/test/**/*.test.tsx",
      "eliza/packages/app-core/test/live-agent/**/*.test.ts",
      "eliza/packages/app-core/test/live-agent/**/*.test.tsx",
      // app-core src-colocated tests run here; test/ harness suites run in
      // the app-unit config (apps/app/vitest.config.ts) which provides the
      // correct @elizaos/app-core alias resolution. Running both in parallel
      // causes file-system race conditions on shared test fixtures.
      "eliza/packages/app-core/src/**/*.test.ts",
      // Keep the standalone-safe Electrobun tests in the default unit suite.
      // native/agent.test.ts requires the full desktop runtime, so it runs only
      // via `bun run test:desktop:contract` in `.github/workflows/test.yml`
      // (and the matching nightly desktop-contract job).
      "eliza/packages/app-core/platforms/electrobun/src/menu-reset-from-main.test.ts",
      "eliza/packages/app-core/platforms/electrobun/src/diagnostic-format.test.ts",
      "eliza/packages/app-core/platforms/electrobun/src/native/steward.test.ts",
      "eliza/packages/app-core/scripts/**/*.test.ts",
      "eliza/packages/shared/src/**/*.test.ts",
      "eliza/packages/app-core/src/**/*.test.tsx",
      "eliza/packages/agent/src/runtime/roles/test/**/*.test.ts",
      "eliza/apps/app-lifeops/src/selfcontrol/**/*.test.ts",
      "eliza/apps/app-vincent/src/**/*.test.ts",
      "eliza/apps/app-shopify/src/**/*.test.ts",
      "eliza/apps/app-steward/src/**/*.test.ts",
      "eliza/apps/app-lifeops/src/**/*.test.ts",
      "packages/plugin-wechat/src/**/*.test.ts",
      "eliza/plugins/plugin-music-player/src/**/*.test.ts",
      "eliza/plugins/plugin-discord/typescript/__tests__/identity.test.ts",
      "eliza/plugins/plugin-discord/typescript/__tests__/slash-command-roles.test.ts",
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "apps/chrome-extension/**/*.test.ts",
      "apps/chrome-extension/**/*.test.tsx",
    ],
    setupFiles: ["eliza/packages/app-core/test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "**/*-live.test.ts",
      "**/*-live.test.tsx",
      "**/*.live.test.ts",
      "**/*.live.test.tsx",
      "**/*-real.test.ts",
      "**/*-real.test.tsx",
      "**/*.real.test.ts",
      "**/*.real.test.tsx",
      "**/*.integration.test.ts",
      "**/*.integration.test.tsx",
      // E2E lives under test/ too; run it via test/vitest/e2e.config.ts, not unit.
      "**/*.e2e.test.ts",
      "**/*.e2e.test.tsx",
      // Requires plugin-training built dist which only exists after `bun run build`.
      "**/training-service.import-ollama.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: [...coverageSummaryReporters],
      thresholds: coverageThresholds,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Entrypoints and wiring (covered by CI smoke + manual/e2e flows).
        "src/entry.ts",
        "src/index.ts",
        "src/cli/**",
        "src/hooks/**",
        // Large files with inline TypeScript `type` imports that rolldown
        // (used by @vitest/coverage-v8) cannot parse. Covered by e2e tests.
        "eliza/packages/agent/src/api/server.ts",
        "eliza/packages/agent/src/runtime/eliza.ts",
      ],
    },
    deps: {
      inline: [
        "@testing-library/react",
        "@elizaos/core",
        "@elizaos/agent",
        "@elizaos/app-core",
        "react",
        "react-dom",
        "react-test-renderer",
        /^@miladyai\/shared/,
        /^@elizaos\/plugin-/,
        /^@elizaos\/shared/,
        "zod",
      ],
    },
    server: {
      deps: {
        inline: [
          "@testing-library/react",
          "@elizaos/core",
          "@elizaos/agent",
          "@elizaos/app-core",
          "react",
          "react-dom",
          "react-test-renderer",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          /^@elizaos\/shared/,
          "zod",
        ],
      },
    },
  },
});
