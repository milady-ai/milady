/**
 * Vitest config for the live/real suite only.
 *
 * This config deliberately avoids the default unit/e2e stub graph and includes
 * only files that are already marked `live` or `real`.
 *
 * Browser-driven QA flows remain opt-in inside the test files themselves
 * (`MILADY_LIVE_BROWSER_SUITE=1`) so `bun run test:real` can pass in
 * environments that have provider credentials but not a launched local UI/API
 * stack.
 *
 * `bun run test:ci:real` sets `MILADY_CI_REAL=1` and loads `test/live-ci.setup.ts`
 * first; Vitest mock auto-restore is disabled so suites exercise real modules.
 */

import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
  getElizaCoreEntry,
  getInstalledPackageEntry,
  getSharedSourceRoot,
  getUiSourceRoot,
  resolveModuleEntry,
} from "../eliza-package-paths";
import { repoRoot } from "./repo-root";

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
const sharedSourceRoot = getSharedSourceRoot(repoRoot);
const uiSourceRoot = getUiSourceRoot(repoRoot);
const appCompanionSourceRoot = path.join(
  repoRoot,
  "eliza",
  "apps",
  "app-companion",
  "src",
);
const pluginAgentOrchestratorEntry =
  getInstalledPackageEntry("@elizaos/core/agent-orchestrator", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "eliza",
      "packages",
      "typescript",
      "src",
      "agent-orchestrator",
      "index",
    ),
  );
const pluginAgentSkillsEntry =
  getInstalledPackageEntry("@elizaos/plugin-agent-skills", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginCommandsEntry =
  getInstalledPackageEntry("@elizaos/plugin-commands", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-commands",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginCronEntry =
  getInstalledPackageEntry("@elizaos/plugin-cron", repoRoot) ??
  resolveModuleEntry(
    path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-cron",
      "typescript",
      "src",
      "index",
    ),
  );
const pluginOpenAiEntry =
  getInstalledPackageEntry("@elizaos/plugin-openai", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-openai", "typescript", "index.node"),
  );
const pluginAnthropicEntry =
  getInstalledPackageEntry("@elizaos/plugin-anthropic", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-anthropic", "typescript", "index.node"),
  );
const pluginGoogleGenAiEntry =
  getInstalledPackageEntry("@elizaos/plugin-google-genai", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-google-genai", "typescript", "index.node"),
  );
const pluginGroqEntry =
  getInstalledPackageEntry("@elizaos/plugin-groq", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-groq", "typescript", "index.node"),
  );
const pluginOllamaEntry =
  getInstalledPackageEntry("@elizaos/plugin-ollama", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-ollama", "typescript", "index.node"),
  );
const pluginOpenRouterEntry =
  getInstalledPackageEntry("@elizaos/plugin-openrouter", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-openrouter", "typescript", "index.node"),
  );
const pluginElizaCloudEntry =
  getInstalledPackageEntry("@elizaos/plugin-elizacloud", repoRoot, "node") ??
  resolveModuleEntry(
    path.join(repoRoot, "eliza", "plugins", "plugin-elizacloud", "typescript", "index.node"),
  );

process.env.MILADY_LIVE_TEST = "1";
process.env.ELIZA_LIVE_TEST = "1";

const ciReal = process.env.MILADY_CI_REAL === "1";

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
              find: "@elizaos/agent",
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
              find: "@elizaos/app-core",
              replacement: resolveModuleEntry(
                path.join(appCoreSourceRoot, "index"),
              ),
            },
          ]
        : []),
      ...(uiSourceRoot
        ? [
            {
              find: /^@elizaos\/ui\/(.*)/,
              replacement: path.join(uiSourceRoot, "$1"),
            },
            {
              find: "@elizaos/ui",
              replacement: resolveModuleEntry(path.join(uiSourceRoot, "index")),
            },
          ]
        : []),
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
        find: /^@elizaos\/app-companion\/(.*)/,
        replacement: path.join(appCompanionSourceRoot, "$1"),
      },
      {
        find: "@elizaos/app-companion/plugin",
        replacement: path.join(appCompanionSourceRoot, "plugin.ts"),
      },
      {
        find: "@elizaos/app-companion",
        replacement: path.join(appCompanionSourceRoot, "index.ts"),
      },
      {
        find: /^@elizaos\/app-steward\/routes\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-steward", "src", "routes", "$1.ts"),
      },
      {
        find: /^@elizaos\/app-steward\/api\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-steward", "src", "api", "$1.ts"),
      },
      {
        find: /^@elizaos\/app-steward\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-steward", "src", "$1"),
      },
      {
        find: "@elizaos/app-steward",
        replacement: path.join(repoRoot, "eliza", "apps", "app-steward", "src", "index.ts"),
      },
      {
        find: "@elizaos/app-training/routes/training",
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "routes", "training-routes.ts"),
      },
      {
        find: "@elizaos/app-training/routes/trajectory",
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "routes", "trajectory-routes.ts"),
      },
      {
        find: "@elizaos/app-training/services",
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "services", "index.ts"),
      },
      {
        find: /^@elizaos\/app-training\/core\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "core", "$1.ts"),
      },
      {
        find: /^@elizaos\/app-training\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "$1"),
      },
      {
        find: "@elizaos/app-training",
        replacement: path.join(repoRoot, "eliza", "apps", "app-training", "src", "index.ts"),
      },
      {
        find: "@elizaos/app-knowledge/routes",
        replacement: path.join(repoRoot, "eliza", "apps", "app-knowledge", "src", "routes.ts"),
      },
      {
        find: "@elizaos/app-knowledge/service-loader",
        replacement: path.join(repoRoot, "eliza", "apps", "app-knowledge", "src", "service-loader.ts"),
      },
      {
        find: /^@elizaos\/app-knowledge\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-knowledge", "src", "$1"),
      },
      {
        find: "@elizaos/app-knowledge",
        replacement: path.join(repoRoot, "eliza", "apps", "app-knowledge", "src", "index.ts"),
      },
      {
        find: /^@elizaos\/app-form\/(.*)/,
        replacement: path.join(repoRoot, "eliza", "apps", "app-form", "src", "$1"),
      },
      {
        find: "@elizaos/app-form",
        replacement: path.join(repoRoot, "eliza", "apps", "app-form", "src", "index.ts"),
      },
      ...(sharedSourceRoot
        ? [
            {
              find: "@elizaos/shared/config",
              replacement: path.join(sharedSourceRoot, "config", "types.ts"),
            },
            {
              find: /^@elizaos\/shared\/(.*)/,
              replacement: path.join(sharedSourceRoot, "$1"),
            },
            {
              find: "@elizaos/shared",
              replacement: path.join(sharedSourceRoot, "index.ts"),
            },
            {
              find: /^@miladyai\/shared\/(.*)/,
              replacement: path.join(sharedSourceRoot, "$1"),
            },
            {
              find: "@elizaos/shared",
              replacement: path.join(sharedSourceRoot, "index.ts"),
            },
          ]
        : []),
      ...(fs.existsSync(pluginAgentOrchestratorEntry)
        ? [
            {
              find: "@elizaos/core/agent-orchestrator",
              replacement: pluginAgentOrchestratorEntry,
            },
            {
              find: "@elizaos/plugin-agent-orchestrator",
              replacement: pluginAgentOrchestratorEntry,
            },
            {
              find: "@elizaos/plugin-coding-agent",
              replacement: pluginAgentOrchestratorEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginAgentSkillsEntry)
        ? [
            {
              find: "@elizaos/plugin-agent-skills",
              replacement: pluginAgentSkillsEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginCommandsEntry)
        ? [
            {
              find: "@elizaos/plugin-commands",
              replacement: pluginCommandsEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginCronEntry)
        ? [
            {
              find: "@elizaos/plugin-cron",
              replacement: pluginCronEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginOpenAiEntry)
        ? [
            {
              find: "@elizaos/plugin-openai",
              replacement: pluginOpenAiEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginAnthropicEntry)
        ? [
            {
              find: "@elizaos/plugin-anthropic",
              replacement: pluginAnthropicEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginGoogleGenAiEntry)
        ? [
            {
              find: "@elizaos/plugin-google-genai",
              replacement: pluginGoogleGenAiEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginGroqEntry)
        ? [
            {
              find: "@elizaos/plugin-groq",
              replacement: pluginGroqEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginOllamaEntry)
        ? [
            {
              find: "@elizaos/plugin-ollama",
              replacement: pluginOllamaEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginOpenRouterEntry)
        ? [
            {
              find: "@elizaos/plugin-openrouter",
              replacement: pluginOpenRouterEntry,
            },
          ]
        : []),
      ...(fs.existsSync(pluginElizaCloudEntry)
        ? [
            {
              find: "@elizaos/plugin-elizacloud",
              replacement: pluginElizaCloudEntry,
            },
          ]
        : []),
    ],
  },
  test: {
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    restoreMocks: false,
    clearMocks: false,
    mockReset: false,
    execArgv: ["--max-old-space-size=4096"],
    setupFiles: ["eliza/packages/app-core/test/live.setup.ts"],
    include: [
      "**/*.live.test.ts",
      "**/*.live.test.tsx",
      "**/*-live.test.ts",
      "**/*-live.test.tsx",
      "**/*.live.e2e.test.ts",
      "**/*.live.e2e.test.tsx",
      "**/*-live.e2e.test.ts",
      "**/*-live.e2e.test.tsx",
      "**/*.real.test.ts",
      "**/*.real.test.tsx",
      "**/*-real.test.ts",
      "**/*-real.test.tsx",
      "**/*.real.e2e.test.ts",
      "**/*.real.e2e.test.tsx",
      "**/*-real.e2e.test.ts",
      "**/*-real.e2e.test.tsx",
    ],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "apps/app/electrobun/**",
      "apps/chrome-extension/**",
      "eliza/cloud/**",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/core",
          "@elizaos/agent",
          "@elizaos/app-core",
          /^@miladyai\/shared/,
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
