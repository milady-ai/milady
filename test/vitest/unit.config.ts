import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import { getElizaCoreEntry } from "../../eliza/packages/app-core/test/eliza-package-paths";
import baseConfig from "./default.config";
import { repoRoot } from "./repo-root";

const elizaCoreEntry = getElizaCoreEntry(repoRoot);

// Only alias @elizaos/core to the submodule source when its dependencies are
// installed. CI checks out the submodule but skips dep install
// (MILADY_SKIP_LOCAL_UPSTREAMS=1), so let it resolve via npm package instead.
const elizaCoreSource = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
  "src",
  "index.ts",
);
const useLocalElizaCore =
  existsSync(elizaCoreSource) &&
  existsSync(
    path.join(repoRoot, "eliza", "packages", "typescript", "node_modules"),
  );

// `@elizaos/core/roles` fallback to the committed shim when the local
// eliza checkout is absent (CI published-only mode). See
// `test/vitest/default.config.ts` for the rationale. This alias MUST be declared in
// the unit config too: `mergeConfig` does not deep-merge
// `resolve.alias` arrays between base and extended configs the way
// top-level config keys merge, so the alias in the default config is
// NOT inherited by unit-test runs.
const elizaCoreRolesSourceFile = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
  "src",
  "roles.ts",
);
const elizaCoreRolesEntry = existsSync(elizaCoreRolesSourceFile)
  ? elizaCoreRolesSourceFile
  : path.join(
      repoRoot,
      "eliza",
      "packages",
      "app-core",
      "scripts",
      "lib",
      "elizaos-core-roles-shim.js",
    );

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          // Always applied — the shim fallback is always present even
          // when the local eliza checkout is disabled.
          find: "@elizaos/core/roles",
          replacement: elizaCoreRolesEntry,
        },
        ...(useLocalElizaCore
          ? [
              {
                find: "@elizaos/core/testing",
                replacement: path.join(
                  repoRoot,
                  "eliza",
                  "packages",
                  "typescript",
                  "src",
                  "testing",
                  "index.ts",
                ),
              },
            ]
          : []),
        ...((useLocalElizaCore ? elizaCoreSource : elizaCoreEntry) != null
          ? [
              {
                // Published-only CI disables the repo-local eliza checkout, so
                // unit tests must fall back to the installed package entry in
                // that mode.
                find: "@elizaos/core",
                replacement: useLocalElizaCore
                  ? elizaCoreSource
                  : (elizaCoreEntry as string),
              },
            ]
          : []),
        // NOTE: `@elizaos/plugin-plugin-manager` aliases were hoisted into
        // the base `test/vitest/default.config.ts` so they also apply when the pre-
        // review gate runs `bunx vitest run <file>` without `--config`
        // (which uses the base config, not this one). Keeping them in
        // one place prevents drift between the unit-only config and
        // the default pre-review config.
      ],
    },
    test: {
      // Keep unit coverage focused on colocated source tests plus shared
      // helpers. The higher-level app harness suites under packages/app-core
      // test/app run as targeted renderer/startup flows instead of unit jobs.
      coverage: {
        excludeAfterRemap: true,
        include: [
          "packages/**/src/**/*.ts",
          "apps/**/src/**/*.ts",
          "scripts/**/*.ts",
        ],
        exclude: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.live.test.ts",
          "**/*.integration.test.ts",
          "**/*.integration.test.tsx",
          "**/*.e2e.test.ts",
          "**/*.e2e.test.tsx",
          "dist/**",
          "**/node_modules/**",
          "eliza/packages/app-core/src/**/*.tsx",
          "eliza/packages/app-core/src/i18n/**",
          "eliza/packages/app-core/src/platform/**",
          "eliza/packages/app-core/test/app/**",
        ],
      },
      exclude: [
        "dist/**",
        "**/node_modules/**",
        "**/*.live.test.ts",
        "**/*.integration.test.ts",
        "**/*.integration.test.tsx",
        "**/*.e2e.test.ts",
        "**/*.e2e.test.tsx",
        "eliza/packages/app-core/test/app/**",
      ],
    },
  }),
);
