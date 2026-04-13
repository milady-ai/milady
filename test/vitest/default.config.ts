import fs from "node:fs";
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
  resolveModuleEntry,
} from "../../eliza/packages/app-core/test/eliza-package-paths";
import { repoRoot } from "./repo-root";

const elizaCoreEntry = getElizaCoreEntry(repoRoot);
// Prefer the repo-local eliza source when it's present; fall back to the
// committed `scripts/lib/elizaos-core-roles-shim.js` bundle when it is not.
// CI with `MILADY_SKIP_LOCAL_UPSTREAMS=1` renames `./eliza/` to
// `./.eliza.ci-disabled/`, so the first path does not exist there. The shim
// is a pre-bundled ESM copy of eliza/packages/typescript/src/roles.ts with
// its helper dependencies left as top-level imports from `@elizaos/core`.
const elizaCoreRolesSource = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
  "src",
  "roles.ts",
);
const elizaCoreRolesEntry = fs.existsSync(elizaCoreRolesSource)
  ? elizaCoreRolesSource
  : path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "scripts",
      "lib",
      "elizaos-core-roles-shim.js",
    );
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
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

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "ethers", "@elizaos/core"],
    alias: [
      {
        // App-core unit tests mock this plugin, but the specifier still has to
        // resolve during module graph construction under the root Vitest config.
        find: "@elizaos/capacitor-agent",
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "app-core",
          "test",
          "stubs",
          "module-fallback.mjs",
        ),
      },
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
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
        // plugin-plugin-manager is now built into @elizaos/core core-capabilities.
        // Alias kept for backward compat with tests that still import the old package name.
        find: "@elizaos/plugin-plugin-manager",
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "typescript",
          "src",
          "core-capabilities",
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
        ? [
            {
              find: /^@elizaos\/agent\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: "@elizaos/agent",
              replacement: resolveModuleEntry(
                path.join(autonomousSourceRoot, "index"),
              ),
            },
          ]
        : [
            {
              // Stub @elizaos/agent sub-path imports when the package is absent
              // so transitive imports (e.g. contracts/wallet) don't break tests.
              find: /^@elizaos\/agent(\/.*)?$/,
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "module-fallback.mjs",
              ),
            },
          ]),
      ...(appCoreSourceRoot
        ? [
            {
              find: "@elizaos/app-core/bridge/electrobun-rpc.js",
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@elizaos/app-core/bridge/electrobun-rpc",
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@elizaos/app-core/bridge/electrobun-runtime",
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@elizaos/app-core/bridge",
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: /^@elizaos\/app-core\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/app-core\/src\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/app-core\/(.*)/,
              replacement: path.join(appCoreSourceRoot, "$1"),
            },
            {
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(
                path.join(appCoreSourceRoot, "index"),
              ),
            },
          ]
        : [
            {
              // Stub app-core when workspace is absent — its npm dist has
              // extensionless JS imports that break under vitest/vite.
              find: /^@elizaos\/app-core(\/.*)?$/,
              replacement: path.join(
                repoRoot,
                "eliza",
                "packages",
                "app-core",
                "test",
                "stubs",
                "plugin-fallback-module.mjs",
              ),
            },
          ]),
      // @elizaos/app-companion — resolve subpath imports from source
      {
        find: /^@elizaos\/app-companion\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-companion",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-companion",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-companion",
          "src",
          "index.ts",
        ),
      },
      // @elizaos/app-coding
      {
        find: /^@elizaos\/app-coding\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-coding",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-coding",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-coding",
          "src",
          "index.ts",
        ),
      },
      // @elizaos/app-vincent
      {
        find: /^@elizaos\/app-vincent\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-vincent",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-vincent",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-vincent",
          "src",
          "index.ts",
        ),
      },
      // @elizaos/app-shopify
      {
        find: /^@elizaos\/app-shopify\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-shopify",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-shopify",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-shopify",
          "src",
          "index.ts",
        ),
      },
      // @elizaos/app-steward
      {
        find: /^@elizaos\/app-steward\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-steward",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-steward",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-steward",
          "src",
          "index.ts",
        ),
      },
      // @elizaos/app-lifeops and @elizaos/shared
      {
        find: /^@elizaos\/app-lifeops\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-lifeops",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/app-lifeops",
        replacement: path.join(
          repoRoot,
          "eliza",
          "apps",
          "app-lifeops",
          "src",
          "index.ts",
        ),
      },
      {
        find: /^@miladyai\/shared\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "shared",
          "src",
          "$1",
        ),
      },
      {
        find: /^@elizaos\/shared\/(.*)/,
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "shared",
          "src",
          "$1",
        ),
      },
      {
        find: "@elizaos/shared",
        replacement: path.join(
          repoRoot,
          "eliza",
          "packages",
          "shared",
          "src",
          "index.ts",
        ),
      },
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
      // app-core src-colocated tests run here; test/ harness suites run in
      // the app-unit config (apps/app/vitest.config.ts) which provides the
      // correct @elizaos/app-core alias resolution. Running both in parallel
      // causes file-system race conditions on shared test fixtures.
      "eliza/packages/app-core/src/**/*.test.ts",
      "eliza/packages/shared/src/**/*.test.ts",
      "eliza/packages/app-core/src/**/*.test.tsx",
      "eliza/packages/agent/src/runtime/roles/test/**/*.test.ts",
      "eliza/apps/app-lifeops/src/selfcontrol/**/*.test.ts",
      "packages/plugin-wechat/src/**/*.test.ts",
      "eliza/plugins/plugin-music-player/src/**/*.test.ts",
      "eliza/plugins/plugin-discord/typescript/__tests__/identity.test.ts",
      "eliza/plugins/plugin-discord/typescript/__tests__/slash-command-roles.test.ts",
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "apps/app/electrobun/src/**/*.test.ts",
      "apps/app/electrobun/src/**/*.test.tsx",
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
        "@elizaos/core",
        "@elizaos/agent",
        "@elizaos/app-core",
        /^@miladyai\/shared/,
        /^@elizaos\/plugin-/,
        /^@elizaos\/shared/,
        "zod",
      ],
    },
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@elizaos/agent",
          "@elizaos/app-core",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          /^@elizaos\/shared/,
          "zod",
        ],
      },
    },
  },
});
