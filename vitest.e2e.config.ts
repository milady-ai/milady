import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);

const liveTest = process.env.MILADY_LIVE_TEST === "1";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
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
        : []),
      ...(appCoreSourceRoot
        ? [
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
        : []),
      {
        find: "@elizaos/skills",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        find: "@elizaos/plugin-repoprompt",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
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
      {
        find: "@elizaos/plugin-pdf",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        find: "@elizaos/plugin-form",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        find: "@elizaos/plugin-pi-ai",
        replacement: path.join(repoRoot, "test", "stubs", "pi-ai-module.ts"),
      },
      ...(!liveTest
        ? [
            {
              find: "@elizaos/plugin-openai",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
            {
              find: "@elizaos/plugin-ollama",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
            {
              find: "@elizaos/plugin-local-embedding",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
            {
              find: "@elizaos/plugin-sql",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
            {
              find: "@elizaos/plugin-discord",
              replacement: path.join(
                repoRoot,
                "test",
                "stubs",
                "plugin-stub.mjs",
              ),
            },
          ]
        : []),
      {
        find: "@elizaos/plugin-telegram",
        replacement: path.join(
          repoRoot,
          "test",
          "stubs",
          "plugin-telegram-module.ts",
        ),
      },
      {
        find: "electron",
        replacement: path.join(repoRoot, "test", "stubs", "electron-module.ts"),
      },
      {
        find: /^@lookingglass\/webxr/,
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
    ],
  },
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ["test/e2e-global-setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false,
      },
    },
    maxWorkers: 1,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    include: [
      "test/**/*.e2e.test.ts",
      "packages/agent/test/**/*.e2e.test.ts",
      "packages/app-core/test/**/*.e2e.test.ts",
    ],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "**/*-live.test.ts",
      "**/*-live.test.tsx",
      "**/*.live.test.ts",
      "**/*.live.test.tsx",
      "**/*-live.e2e.test.ts",
      "**/*-live.e2e.test.tsx",
      "**/*.live.e2e.test.ts",
      "**/*.live.e2e.test.tsx",
      "**/*.real.e2e.test.ts",
      "**/*.real.e2e.test.tsx",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@miladyai/agent",
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
