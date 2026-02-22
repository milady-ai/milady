import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import { z } from "zod";
import { loadPiAiPluginConfig } from "./config.js";
import { registerPiAiRuntime } from "./runtime.js";

export function readRuntimeModelSpec(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  if (!runtime || typeof runtime.getSetting !== "function") {
    return undefined;
  }

  const raw = runtime.getSetting("MODEL_PROVIDER");
  if (typeof raw !== "string") return undefined;

  const spec = raw.trim();
  if (!spec || !spec.includes("/")) return undefined;
  return spec;
}

export const piAiPlugin: Plugin = {
  name: "pi-ai",
  description:
    "pi-ai provider bridge for ElizaOS. Registers text + image model handlers backed by pi credentials.",

  get config() {
    return {
      PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR ?? null,
      PI_AI_MODEL_SPEC: process.env.PI_AI_MODEL_SPEC ?? null,
      PI_AI_SMALL_MODEL_SPEC: process.env.PI_AI_SMALL_MODEL_SPEC ?? null,
      PI_AI_LARGE_MODEL_SPEC: process.env.PI_AI_LARGE_MODEL_SPEC ?? null,
      PI_AI_PRIORITY: process.env.PI_AI_PRIORITY ?? null,
    };
  },

  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    logger.info("pi-ai: initializing plugin");

    try {
      const normalized = loadPiAiPluginConfig(config);

      const selected = await registerPiAiRuntime(runtime, {
        modelSpec: normalized.modelSpec ?? readRuntimeModelSpec(runtime),
        smallModelSpec: normalized.smallModelSpec,
        largeModelSpec: normalized.largeModelSpec,
        priority: normalized.priority,
        agentDir: normalized.agentDir,
      });

      logger.info(
        `pi-ai: plugin initialized (${selected.provider}/${selected.id})`,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues?.map((issue) => issue.message).join(", ") ||
          "Unknown validation error";
        throw new Error(`pi-ai plugin configuration error: ${issues}`);
      }

      throw new Error(
        `pi-ai plugin initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

export default piAiPlugin;
