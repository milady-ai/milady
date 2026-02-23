import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  type State,
} from "@elizaos/core";
import type {
  MoltbookOnboardInput,
  MoltbookOnboardResult,
  MoltbookService,
} from "../services/moltbook-service.ts";

interface MoltbookOnboardOptions extends Record<string, unknown> {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  saveCredentials?: boolean;
  credentialsPath?: string;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return undefined;
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "[redacted]";
  }
  const prefix = apiKey.slice(0, 8);
  return `${prefix}...[redacted]`;
}

function getRuntimeCharacterName(runtime: IAgentRuntime): string | undefined {
  const character = (runtime as unknown as { character?: { name?: unknown } })
    .character;
  const maybeName = character?.name;
  return typeof maybeName === "string" && maybeName.trim().length > 0
    ? maybeName.trim()
    : undefined;
}

function getRuntimeCharacterDescription(
  runtime: IAgentRuntime,
): string | undefined {
  const character = (
    runtime as unknown as {
      character?: { bio?: unknown; description?: unknown };
    }
  ).character;

  const bio = character?.bio;
  if (typeof bio === "string" && bio.trim().length > 0) {
    return bio.trim();
  }
  if (Array.isArray(bio)) {
    const firstLine = bio.find(
      (line) => typeof line === "string" && line.trim().length > 0,
    );
    if (typeof firstLine === "string") {
      return firstLine.trim();
    }
  }

  const description = character?.description;
  if (typeof description === "string" && description.trim().length > 0) {
    return description.trim();
  }

  return undefined;
}

export function extractOnboardInput(
  runtime: IAgentRuntime,
  options: MoltbookOnboardOptions,
): MoltbookOnboardInput {
  const name =
    normalizeString(options.name) ??
    getRuntimeCharacterName(runtime) ??
    "MiladyAgent";
  const description =
    normalizeString(options.description) ??
    getRuntimeCharacterDescription(runtime) ??
    "Autonomous agent participating on Moltbook.";

  return {
    name,
    description,
    metadata:
      options.metadata && typeof options.metadata === "object"
        ? options.metadata
        : undefined,
    saveCredentials: normalizeBoolean(options.saveCredentials),
    credentialsPath: normalizeString(options.credentialsPath),
  };
}

function safeNullableString(value: string | undefined): string | null {
  return value ?? null;
}

function formatOnboardResult(result: MoltbookOnboardResult): string {
  const lines = [
    "Moltbook onboarding completed.",
    `Agent: ${result.agentName}`,
    `API key: ${maskApiKey(result.apiKey)}`,
  ];
  if (result.claimUrl) {
    lines.push(`Claim URL: ${result.claimUrl}`);
  }
  if (result.verificationCode) {
    lines.push(`Verification code: ${result.verificationCode}`);
  }
  if (result.credentialsSavedPath) {
    lines.push(`Credentials saved: ${result.credentialsSavedPath}`);
  }
  return lines.join("\n");
}

export const moltbookOnboardAction: Action = {
  name: "MOLTBOOK_ONBOARD",
  similes: ["MOLTBOOK_REGISTER", "MOLTBOOK_SIGNUP", "REGISTER_MOLTBOOK_AGENT"],
  description:
    "Register this agent on Moltbook and optionally persist credentials locally.",

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    return Boolean(runtime.getService("moltbook"));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService("moltbook") as MoltbookService | null;
    if (!service) {
      const error =
        "Moltbook service is not available. Ensure plugin-moltbook is enabled.";
      if (callback) {
        await callback({ text: error, source: message.content.source });
      }
      return { success: false, error };
    }

    try {
      const input = extractOnboardInput(
        runtime,
        options as MoltbookOnboardOptions,
      );
      const result = await service.onboardAgent(input);
      const text = formatOnboardResult(result);

      if (callback) {
        await callback({ text, source: message.content.source });
      }

      return {
        success: true,
        text,
        data: {
          success: result.success,
          agentName: result.agentName,
          hasApiKey: true,
          claimUrl: safeNullableString(result.claimUrl),
          verificationCode: safeNullableString(result.verificationCode),
          credentialsSavedPath: safeNullableString(result.credentialsSavedPath),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`MOLTBOOK_ONBOARD failed: ${errorMessage}`);

      if (callback) {
        await callback({ text: errorMessage, source: message.content.source });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "Register this agent on Moltbook",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Moltbook onboarding completed.",
          actions: ["MOLTBOOK_ONBOARD"],
        },
      },
    ],
  ],
};
