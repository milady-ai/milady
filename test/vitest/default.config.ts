/**
 * Test naming convention:
 *
 * *.test.ts            — Unit tests (run by this config / turbo test)
 * *.integration.test.ts — Integration tests (run by integration.config)
 * *.e2e.test.ts        — E2E tests (run by e2e.config)
 * *.real.test.ts       — Real infra tests (run by real.config, needs env vars)
 * *.live.test.ts       — Live tests (run by real.config, needs running services)
 * *.live.e2e.test.ts   — Live E2E (run by live-e2e.config, needs services + env)
 * *.real.e2e.test.ts   — Real E2E (run by e2e.config, needs env vars)
 * *.spec.ts            — Playwright specs (run by playwright configs)
 *
 * Test locations: src/, __tests__/, test/ — all are auto-discovered.
 * Subsystems with their own runners: eliza/cloud, eliza/steward-fi,
 * eliza/packages/examples, eliza/packages/templates, eliza/packages/benchmarks.
 */
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
  getOptionalInstalledPackageAliases,
  getOptionalPluginSdkAliases,
  getSharedSourceAliases,
  getUiSourceAliases,
  getWorkspaceAppAliases,
} from "./workspace-aliases";

interface RootPackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const elizaCoreRolesEntry = getElizaCoreRolesEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const sharedSourceRoot = getSharedSourceRoot(repoRoot);
const uiSourceRoot = getUiSourceRoot(repoRoot);
const packageManifest: RootPackageManifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
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
    const aliases = getOptionalInstalledPackageAliases(repoRoot, [
      {
        find: `${packageName}/node`,
        packageName,
        options: {
          entryKind: "node",
        },
      },
      {
        find: packageName,
        packageName,
      },
    ]);

    if (aliases.some((alias) => alias.find === packageName)) {
      resolvedPluginNames.add(packageName);
    }

    return aliases;
  },
);
// Fall back to a stub when an optional plugin tarball has a broken entry point.
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
const vitestInlineDeps = [
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
];

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "ethers", "@elizaos/core"],
    alias: [
      {
        // Keep React pinned to one installed copy so jsdom does not mix workspace and hoisted peers.
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
        // App-core tests mock this plugin, but Vitest still has to resolve the specifier.
        find: "@elizaos/capacitor-agent",
        replacement: appCoreModuleFallbackPath,
      },
      ...getOptionalPluginSdkAliases(repoRoot),
      // Keep the roles shim here so Vitest resolves it when the local eliza checkout is absent.
      {
        find: "@elizaos/core/roles",
        replacement: elizaCoreRolesEntry,
      },
      {
        // Preserve the old package name for tests that still import it.
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
            // Stub missing @elizaos/agent subpaths so transitive imports keep resolving.
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
    // Give worker forks more heap to survive jsdom-heavy suites.
    execArgv: ["--max-old-space-size=4096"],
    include: [
      // Keep this list explicit. New root/eliza package tests do not auto-join
      // the default suite; add them here when that package is meant to run in
      // the shared root Vitest job. apps/app test/vite/** lives under
      // apps/app/vitest.config.ts instead of this root config.
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
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
      "apps/chrome-extension/**/*.test.ts",
      "apps/chrome-extension/**/*.test.tsx",
    ],
    setupFiles: ["eliza/packages/app-core/test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      // --- live/real/integration/e2e tests have their own configs ---
      "**/*-live.test.{ts,tsx}",
      "**/*.live.test.{ts,tsx}",
      "**/*-real.test.{ts,tsx}",
      "**/*.real.test.{ts,tsx}",
      "**/*.integration.test.{ts,tsx}",
      "**/*.e2e.test.{ts,tsx}",
      "**/*.e2e.spec.{ts,tsx}",
      "**/*.live.e2e.test.{ts,tsx}",
      "**/*.real.e2e.test.{ts,tsx}",
      // --- subsystems with their own test runners ---
      "eliza/cloud/**",
      "eliza/steward-fi/**",
      // --- wired via turbo, not root vitest ---
      "eliza/packages/examples/**",
      "eliza/packages/templates/**",
      "eliza/packages/benchmarks/**",
      // Template plugin tests need a scaffolded environment to run.
      "eliza/packages/elizaos/templates/**",
      // Skills tests use their own package-level runner.
      "eliza/packages/skills/test/**",
      // Homepage tests need jsdom environment (run via apps/homepage vitest config).
      "apps/homepage/**",
      // Requires the built plugin-training dist from `bun run build`.
      "**/training-service.import-ollama.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: [...coverageSummaryReporters],
      thresholds: coverageThresholds,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Entrypoints and wiring are covered by CI smoke and e2e flows.
        "src/entry.ts",
        "src/index.ts",
        "src/cli/**",
        "src/hooks/**",
        // Rolldown coverage still struggles with these inline type-import files.
        "eliza/packages/agent/src/api/server.ts",
        "eliza/packages/agent/src/runtime/eliza.ts",
      ],
    },
    deps: {
      inline: vitestInlineDeps,
    },
    server: {
      deps: {
        inline: vitestInlineDeps,
      },
    },
  },
});
