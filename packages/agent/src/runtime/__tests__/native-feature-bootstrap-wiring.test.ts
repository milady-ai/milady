import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_PLUGINS } from "../core-plugins";

const elizaSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "eliza.ts"),
  "utf-8",
);
const nativeRuntimeFeaturesSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "native-runtime-features.ts"),
  "utf-8",
);
const expectedCorePlugins = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-form",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-plugin-manager",
  "@elizaos/plugin-personality",
];

describe("native feature bootstrap wiring", () => {
  it("keeps the explicit core plugin list aligned with the native bootstrap contract", () => {
    expect(CORE_PLUGINS).toEqual(expectedCorePlugins);
  });

  it("bootstraps the internal roles capability outside the core plugin package list", () => {
    expect(elizaSource).toContain(
      'import rolesPlugin from "./roles/src/index.js"',
    );
    expect(elizaSource).toContain("Pre-registering internal roles capability");
    expect(elizaSource).not.toContain("pluginRoles");
  });

  it("guards plugin-commands bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginCommands from "@elizaos/plugin-commands";',
    );
    expect(elizaSource).toContain(
      'pluginCommands = require("@elizaos/plugin-commands");',
    );
    expect(elizaSource).toContain('"@elizaos/plugin-commands": pluginCommands');
  });

  it("guards plugin-cron bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginCron from "@elizaos/plugin-cron";',
    );
    expect(elizaSource).toContain(
      'pluginCron = require("@elizaos/plugin-cron");',
    );
    expect(elizaSource).toContain('"@elizaos/plugin-cron": pluginCron');
  });

  it("guards plugin-elizacloud bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginElizacloud from "@elizaos/plugin-elizacloud";',
    );
    expect(elizaSource).toContain(
      'pluginElizacloud = require("@elizaos/plugin-elizacloud");',
    );
    expect(elizaSource).toContain(
      '"@elizaos/plugin-elizacloud": pluginElizacloud',
    );
  });

  it("guards plugin-experience bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginExperience from "@elizaos/plugin-experience";',
    );
    expect(elizaSource).toContain(
      'pluginExperience = require("@elizaos/plugin-experience");',
    );
    expect(elizaSource).toContain(
      '"@elizaos/plugin-experience": pluginExperience',
    );
  });

  it("guards plugin-ollama bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginOllama from "@elizaos/plugin-ollama";',
    );
    expect(elizaSource).toContain(
      'pluginOllama = require("@elizaos/plugin-ollama");',
    );
    expect(elizaSource).toContain('"@elizaos/plugin-ollama": pluginOllama');
  });

  it("guards plugin-openai bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginOpenai from "@elizaos/plugin-openai";',
    );
    expect(elizaSource).toContain(
      'pluginOpenai = require("@elizaos/plugin-openai");',
    );
    expect(elizaSource).toContain('"@elizaos/plugin-openai": pluginOpenai');
  });

  it("guards plugin-personality bootstrap behind a runtime require", () => {
    expect(elizaSource).not.toContain(
      'import * as pluginPersonality from "@elizaos/plugin-personality";',
    );
    expect(elizaSource).toContain(
      'pluginPersonality = require("@elizaos/plugin-personality");',
    );
    expect(elizaSource).toContain(
      '"@elizaos/plugin-personality": pluginPersonality',
    );
  });
  it("guards trajectory bootstrap behind the native trajectories toggle", () => {
    const waitBlock =
      elizaSource.match(
        /async function waitForTrajectoriesService\([\s\S]*?\n\}/m,
      )?.[0] ?? "";
    const ensureBlock =
      elizaSource.match(
        /function ensureTrajectoryLoggerEnabled\([\s\S]*?\n\}/m,
      )?.[0] ?? "";

    expect(waitBlock).toContain("if (!runtimeTrajectoriesEnabled(runtime))");
    expect(ensureBlock).toContain("if (!runtimeTrajectoriesEnabled(runtime))");
    expect(ensureBlock).toContain("Native trajectories disabled");
  });

  it("skips bundled knowledge seeding when native knowledge is disabled", () => {
    const initBlock =
      elizaSource.match(
        /const initializeRuntimeServices = async \(\): Promise<void> => \{[\s\S]*?\n {2}\};/m,
      )?.[0] ?? "";

    expect(initBlock).toContain("if (runtimeKnowledgeEnabled(runtime))");
    expect(initBlock).toContain("Native knowledge disabled");
    expect(initBlock).toContain("skipping bundled knowledge seeding");
  });

  it("calls native feature probes with the runtime instance bound", () => {
    expect(elizaSource).toContain('from "./native-runtime-features.js"');

    const trajectoryProbe =
      nativeRuntimeFeaturesSource.match(
        /function runtimeTrajectoriesEnabled\([\s\S]*?\n\}/m,
      )?.[0] ?? "";
    const knowledgeProbe =
      nativeRuntimeFeaturesSource.match(
        /function runtimeKnowledgeEnabled\([\s\S]*?\n\}/m,
      )?.[0] ?? "";

    expect(trajectoryProbe).toContain(
      "runtimeWithFlags.isTrajectoriesEnabled()",
    );
    expect(knowledgeProbe).toContain("runtimeWithFlags.isKnowledgeEnabled()");
    expect(trajectoryProbe).not.toContain("const fn =");
    expect(knowledgeProbe).not.toContain("const fn =");
  });

  it("forwards connector env vars into runtime settings", () => {
    expect(elizaSource).toContain("collectConnectorEnvVars");
    expect(elizaSource).toContain("...collectConnectorEnvVars(config)");
  });
});
