import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";
import {
  coverageSummaryReporters,
  coverageThresholds,
} from "./scripts/coverage-policy.mjs";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const isWindows = process.platform === "win32";
const localWorkers = 2;
const ciWorkers = isWindows ? 2 : 3;

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "ethers", "@elizaos/core"],
    alias: [
      {
        // The @lookingglass/webxr package has a broken ESM import chain
        // (extensionless relative import of @lookingglass/webxr-polyfill/src/api/index)
        // that crashes under Node's strict ESM resolver used by vitest.
        // Stub all @lookingglass/* imports so tests that transitively import
        // VrmEngine.ts don't fail at module resolution time.
        find: /^@lookingglass\/.*/,
        replacement: path.join(
          repoRoot,
          "test",
          "stubs",
          "lookingglass-webxr.ts",
        ),
      },
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
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
          ]
        : []),
      ...(autonomousSourceRoot
        ? [
            {
              find: /^@elizaos\/agent\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: /^@miladyai\/agent\/(.*)/,
              replacement: path.join(autonomousSourceRoot, "$1"),
            },
            {
              find: "@miladyai/agent",
              replacement: resolveModuleEntry(
                path.join(autonomousSourceRoot, "index"),
              ),
            },
          ]
        : [
            {
              // Stub @miladyai/agent sub-path imports when the package is absent
              // so transitive imports (e.g. contracts/wallet) don't break tests.
              find: /^@elizaos\/agent(\/.*)?$/,
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "empty-module.mjs",
              ),
            },
            {
              find: /^@miladyai\/agent(\/.*)?$/,
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "empty-module.mjs",
              ),
            },
          ]),
      ...(appCoreSourceRoot
        ? [
            {
              find: "@miladyai/app-core/bridge/electrobun-rpc.js",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@miladyai/app-core/bridge/electrobun-rpc",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@miladyai/app-core/bridge/electrobun-runtime",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "app-core-bridge.ts",
              ),
            },
            {
              find: "@miladyai/app-core/bridge",
              replacement: path.join(
                repoRoot,
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
              find: "@miladyai/app-core",
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
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
          ]),
      // @miladyai/shared — always resolve subpath imports from source
      {
        find: /^@miladyai\/shared\/(.*)/,
        replacement: path.join(repoRoot, "packages", "shared", "src", "$1"),
      },
      {
        find: "@miladyai/shared",
        replacement: path.join(repoRoot, "packages", "shared", "src", "index.ts"),
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
      "packages/agent/src/**/*.test.ts",
      "packages/agent/src/**/*.test.tsx",
      "packages/agent/test/**/*.test.ts",
      "packages/agent/test/**/*.test.tsx",
      // app-core: globs (not single files) so colocated *.test.tsx and harness
      // suites under packages/app-core/test/{state,runtime,...} run in CI.
      // WHY: omitting test/** silently dropped new suites; listing one TSX path
      // rotted when files moved. E2E under app-core/test is excluded below.
      "packages/app-core/src/**/*.test.ts",
      "packages/app-core/src/**/*.test.tsx",
      "packages/app-core/test/**/*.test.ts",
      "packages/app-core/test/**/*.test.tsx",
      "packages/plugin-wechat/src/**/*.test.ts",
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "apps/app/electrobun/src/**/*.test.ts",
      "apps/app/electrobun/src/**/*.test.tsx",
      "apps/chrome-extension/**/*.test.ts",
      "apps/chrome-extension/**/*.test.tsx",
      "test/format-error.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "**/*.live.test.ts",
      "**/*.real.test.ts",
      "**/*.real.test.tsx",
      // E2E lives under test/ too; run it via vitest.e2e.config.ts, not unit.
      "**/*.e2e.test.ts",
      "**/*.e2e.test.tsx",
      "packages/app-core/test/**/*.e2e.test.ts",
      "packages/app-core/test/**/*.e2e.test.tsx",
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
        "packages/agent/src/api/server.ts",
        "packages/agent/src/runtime/eliza.ts",
      ],
    },
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@miladyai/agent",
          "@miladyai/app-core",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
