import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";
import { moltbookOnboardAction } from "./actions/onboard.ts";
import { moltbookApiRequestAction } from "./actions/request.ts";
import { loadMoltbookConfig } from "./config.ts";
import { moltbookStatusProvider } from "./providers/status.ts";
import { moltbookRoutes } from "./routes.ts";
import { MoltbookService } from "./services/moltbook-service.ts";

export const moltbookPlugin: Plugin = {
  name: "moltbook",
  description:
    "Moltbook integration for ElizaOS. Supports agent onboarding and safe API requests bound to www.moltbook.com.",

  get config() {
    return {
      MOLTBOOK_API_BASE_URL: process.env.MOLTBOOK_API_BASE_URL ?? null,
      MOLTBOOK_API_KEY: process.env.MOLTBOOK_API_KEY ?? null,
      MOLTBOOK_AGENT_NAME: process.env.MOLTBOOK_AGENT_NAME ?? null,
      MOLTBOOK_CREDENTIALS_PATH: process.env.MOLTBOOK_CREDENTIALS_PATH ?? null,
      MOLTBOOK_TIMEOUT_MS: process.env.MOLTBOOK_TIMEOUT_MS ?? null,
      MOLTBOOK_MAX_RESPONSE_CHARS:
        process.env.MOLTBOOK_MAX_RESPONSE_CHARS ?? null,
    };
  },

  async init(config: Record<string, string>) {
    logger.info("Moltbook: initializing plugin");

    try {
      const normalized = loadMoltbookConfig(config);

      for (const [key, value] of Object.entries(config)) {
        if (!key.startsWith("MOLTBOOK_")) {
          continue;
        }

        if (value) {
          process.env[key] = value;
        }
      }

      logger.info(
        `Moltbook: plugin initialized (base=${normalized.apiBaseUrl}, timeout=${normalized.timeoutMs}ms)`,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues?.map((issue) => issue.message).join(", ") ||
          "Unknown validation error";
        throw new Error(`Moltbook plugin configuration error: ${issues}`);
      }

      throw new Error(
        `Moltbook plugin initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  services: [MoltbookService],
  actions: [moltbookOnboardAction, moltbookApiRequestAction],
  providers: [moltbookStatusProvider],
  routes: moltbookRoutes,
};

export default moltbookPlugin;
