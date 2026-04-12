import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ElizaConfig } from "../src/config/config";
import { CORE_PLUGINS } from "../src/runtime/core-plugins";
import { resolvePlugins } from "../src/runtime/plugin-resolver";

const originalEnv = { ...process.env };
const providerEnvKeys = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "MISTRAL_API_KEY",
  "TOGETHER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AIGATEWAY_API_KEY",
  "OLLAMA_BASE_URL",
  "ZAI_API_KEY",
  "ELIZA_USE_PI_AI",
  "MILADY_USE_PI_AI",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_ENABLED",
] as const;

type TestPaths = {
  tempDir: string;
  workspaceRoot: string;
  stateDir: string;
  pluginName: string;
  pluginSegment: string;
  nodeModulesLinkPath: string;
};

async function writePluginPackage(params: {
  root: string;
  packageName: string;
  pluginLabel: string;
}): Promise<void> {
  const distDir = path.join(params.root, "dist", "node");
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(
    path.join(params.root, "package.json"),
    JSON.stringify(
      {
        name: params.packageName,
        version: "0.0.0-test",
        type: "module",
        main: "dist/node/index.node.js",
        module: "dist/node/index.node.js",
        exports: {
          ".": {
            import: "./dist/node/index.node.js",
            default: "./dist/node/index.node.js",
          },
        },
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(distDir, "index.node.js"),
    [
      `const plugin = {`,
      `  name: ${JSON.stringify(params.pluginLabel)},`,
      `  description: ${JSON.stringify(params.pluginLabel)},`,
      `};`,
      `export const testPlugin = plugin;`,
      `export default plugin;`,
      ``,
    ].join("\n"),
  );
}

describe("plugin-resolver workspace overrides", () => {
  let paths: TestPaths;

  beforeEach(async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-plugin-resolver-"),
    );
    const workspaceRoot = path.join(tempDir, "workspace");
    const stateDir = path.join(tempDir, "state");
    const pluginSegment = `plugin-workspace-override-test-${crypto.randomUUID()}`;
    const pluginName = `@elizaos/${pluginSegment}`;
    const workspacePluginRoot = path.join(
      workspaceRoot,
      "plugins",
      pluginSegment,
      "typescript",
    );
    const installedPluginRoot = path.join(tempDir, "installed", pluginSegment);
    const nodeModulesLinkPath = path.join(
      process.cwd(),
      "node_modules",
      "@elizaos",
      pluginSegment,
    );

    await writePluginPackage({
      root: workspacePluginRoot,
      packageName: pluginName,
      pluginLabel: "workspace override",
    });
    await writePluginPackage({
      root: installedPluginRoot,
      packageName: pluginName,
      pluginLabel: "node_modules install",
    });

    await fs.mkdir(path.dirname(nodeModulesLinkPath), { recursive: true });
    await fs.rm(nodeModulesLinkPath, { recursive: true, force: true });
    await fs.symlink(installedPluginRoot, nodeModulesLinkPath, "dir");

    process.env = {
      ...originalEnv,
      ELIZA_STATE_DIR: stateDir,
      MILADY_STATE_DIR: stateDir,
      ELIZA_WORKSPACE_ROOT: workspaceRoot,
      ELIZA_SKIP_PLUGINS: CORE_PLUGINS.join(","),
    };
    for (const key of providerEnvKeys) {
      delete process.env[key];
    }

    paths = {
      tempDir,
      workspaceRoot,
      stateDir,
      pluginName,
      pluginSegment,
      nodeModulesLinkPath,
    };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    if (paths) {
      await fs.rm(paths.nodeModulesLinkPath, {
        recursive: true,
        force: true,
      });
      await fs.rm(paths.tempDir, {
        recursive: true,
        force: true,
      });
    }
  });

  it("prefers official workspace overrides over node_modules installs on repeated resolves", async () => {
    const config: ElizaConfig = {
      logging: { level: "error" },
      plugins: { allow: [paths.pluginName] },
    };

    const first = await resolvePlugins(config, { quiet: true });
    const second = await resolvePlugins(config, { quiet: true });

    const firstPlugin = first.find(
      (candidate) => candidate.name === paths.pluginName,
    );
    const secondPlugin = second.find(
      (candidate) => candidate.name === paths.pluginName,
    );

    expect(firstPlugin?.plugin.description).toBe("workspace override");
    expect(secondPlugin?.plugin.description).toBe("workspace override");
    expect(firstPlugin?.plugin.name).toBe("workspace override");
    expect(secondPlugin?.plugin.name).toBe("workspace override");
  });
});
