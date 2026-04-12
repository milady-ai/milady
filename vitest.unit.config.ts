import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { getElizaCoreEntry } from "./test/eliza-package-paths";
import baseConfig from "./vitest.config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
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

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        // Subpath exports must be aliased before the catch-all "@elizaos/core"
        // entry, otherwise Vite's alias matching swallows the subpath.
        ...(useLocalElizaCore
          ? [
              {
                find: "@elizaos/core/roles",
                replacement: path.join(
                  repoRoot,
                  "eliza",
                  "packages",
                  "typescript",
                  "src",
                  "roles.ts",
                ),
              },
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
        ...((useLocalElizaCore
          ? elizaCoreSource
          : elizaCoreEntry) != null
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
        {
          find: "@elizaos/plugin-cron",
          replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
        },
        {
          find: "@elizaos/plugin-edge-tts/node",
          replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
        },
        {
          find: "@elizaos/plugin-edge-tts",
          replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
        },
        {
          find: "@elizaos/plugin-openai",
          replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
        },
        {
          find: "@elizaos/plugin-trust",
          replacement: path.join(repoRoot, "test", "stubs", "plugin-stub.mjs"),
        },
        {
          find: "@elizaos/plugin-agent-orchestrator",
          replacement: path.join(
            repoRoot,
            "test",
            "stubs",
            "coding-agent-module.ts",
          ),
        },
        {
          find: "@elizaos/plugin-coding-agent",
          replacement: path.join(
            repoRoot,
            "test",
            "stubs",
            "coding-agent-module.ts",
          ),
        },
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
          "test/**/*.ts",
        ],
        exclude: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.live.test.ts",
          "**/*.e2e.test.ts",
          "**/*.e2e.test.tsx",
          "dist/**",
          "**/node_modules/**",
          "packages/app-core/src/**/*.tsx",
          "packages/app-core/src/i18n/**",
          "packages/app-core/src/platform/**",
          "packages/app-core/test/app/**",
        ],
      },
      exclude: [
        "dist/**",
        "**/node_modules/**",
        "**/*.live.test.ts",
        "**/*.e2e.test.ts",
        "**/*.e2e.test.tsx",
        "packages/app-core/test/app/**",
      ],
    },
  }),
);
