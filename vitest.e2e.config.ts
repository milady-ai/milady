import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getInstalledPackageEntry,
  resolveModuleEntry,
} from "./test/eliza-package-paths";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const elizaCoreEntry = getElizaCoreEntry(repoRoot);
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
  : path.join(repoRoot, "scripts", "lib", "elizaos-core-roles-shim.js");
const autonomousSourceRoot = getAutonomousSourceRoot(repoRoot);
const appCoreSourceRoot = getAppCoreSourceRoot(repoRoot);
const pluginPersonalityEntry =
  getInstalledPackageEntry("@elizaos/plugin-personality", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-personality",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginSignalEntry =
  getInstalledPackageEntry("@elizaos/plugin-signal", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-signal",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginSqlEntry =
  getInstalledPackageEntry("@elizaos/plugin-sql", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "plugins", "plugin-sql", "typescript", "index.node"),
  );
const pluginWhatsappEntry =
  getInstalledPackageEntry("@elizaos/plugin-whatsapp", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "plugins",
      "plugin-whatsapp",
      "typescript",
      "src",
      "index",
    ),
  );

const liveTest = process.env.MILADY_LIVE_TEST === "1";
export default defineConfig({
  resolve: {
    alias: [
      {
        find: "milady/plugin-sdk",
        replacement: path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      },
      {
        find: "@elizaos/core/roles",
        replacement: elizaCoreRolesEntry,
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
        find: /^@miladyai\/plugin-selfcontrol\/(.*)/,
        replacement: path.join(
          repoRoot,
          "packages",
          "plugin-selfcontrol",
          "src",
          "$1",
        ),
      },
      {
        find: "@miladyai/plugin-selfcontrol",
        replacement: path.join(
          repoRoot,
          "packages",
          "plugin-selfcontrol",
          "src",
          "index.ts",
        ),
      },
      {
        find: "@elizaos/skills",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      ...(fs.existsSync(pluginPersonalityEntry)
        ? [
            {
              find: "@elizaos/plugin-personality",
              replacement: pluginPersonalityEntry,
            },
          ]
        : []),
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
      ...(fs.existsSync(pluginSignalEntry)
        ? [
            {
              find: "@elizaos/plugin-signal",
              replacement: pluginSignalEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginSqlEntry)
        ? [
            {
              find: "@elizaos/plugin-sql",
              replacement: pluginSqlEntry,
            },
          ]
        : []),
      {
        find: "@elizaos/plugin-edge-tts",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
      },
      {
        find: "@elizaos/plugin-edge-tts/node",
        replacement: path.join(repoRoot, "test", "stubs", "empty-module.mjs"),
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
      ...(fs.existsSync(pluginWhatsappEntry)
        ? [
            {
              find: "@elizaos/plugin-whatsapp",
              replacement: pluginWhatsappEntry,
            },
          ]
        : []),
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
    // E2E files frequently replace globals and module-level mocks. Shared module
    // state causes cross-file bleed, which is more expensive to debug than the
    // small cost of per-file isolation.
    isolate: true,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // Match the unit test worker heap to avoid late jsdom OOM crashes during
    // serial E2E runs, where one fork accumulates dozens of suites.
    execArgv: ["--max-old-space-size=4096"],
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
      "packages/app-core/test/app/startup-chat.e2e.test.ts",
      "packages/app-core/test/app/startup-onboarding.e2e.test.ts",
      "packages/app-core/test/app/startup-backend-missing.e2e.test.ts",
      "packages/app-core/test/app/startup-token-401.e2e.test.ts",
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
