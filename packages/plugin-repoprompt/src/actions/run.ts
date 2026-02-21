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
  RepoPromptRunInput,
  RepoPromptRunResult,
  RepoPromptService,
} from "../services/repoprompt-service.ts";

interface RepoPromptActionOptions extends Record<string, unknown> {
  command?: string;
  args?: string[] | string;
  window?: string | number;
  tab?: string;
  cwd?: string;
  stdin?: string;
}

const TOKEN_PATTERN =
  /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|(\S+)/g;

export function parseTokens(raw: string): string[] {
  const tokens: string[] = [];
  for (const match of raw.matchAll(TOKEN_PATTERN)) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    const unescaped = value.replace(/\\(["'`\\])/g, "$1");
    if (unescaped.length > 0) {
      tokens.push(unescaped);
    }
  }
  return tokens;
}

function normalizeArgs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return parseTokens(value);
  }
  return [];
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function extractRunInput(
  message: Memory,
  options: RepoPromptActionOptions,
): RepoPromptRunInput | null {
  const command = normalizeString(options.command);
  const args = normalizeArgs(options.args);
  const base: RepoPromptRunInput = {
    window:
      typeof options.window === "number" || typeof options.window === "string"
        ? options.window
        : undefined,
    tab: normalizeString(options.tab),
    cwd: normalizeString(options.cwd),
    stdin: normalizeString(options.stdin),
  };

  if (command || args.length > 0) {
    return {
      ...base,
      command,
      args,
    };
  }

  const rawText = normalizeString(message.content?.text);
  if (!rawText) {
    return null;
  }

  const prefixMatch = rawText.match(/^(?:\/?repoprompt|rp-cli)\s+(.+)$/i);
  if (!prefixMatch) {
    return null;
  }

  const tokens = parseTokens(prefixMatch[1]);
  if (tokens.length === 0) {
    return null;
  }

  return {
    ...base,
    command: tokens[0],
    args: tokens.slice(1),
  };
}

function summarizeResult(result: RepoPromptRunResult): string {
  const status = result.ok
    ? "✅ RepoPrompt command completed."
    : "❌ RepoPrompt command failed.";
  const previewSource = (
    result.ok ? result.stdout : result.stderr || result.stdout
  ).trim();
  if (!previewSource) {
    return status;
  }

  const preview = previewSource.slice(0, 600);
  const suffix = previewSource.length > 600 ? "\n…" : "";
  return `${status}\n\n${preview}${suffix}`;
}

export const repoPromptRunAction: Action = {
  name: "REPOPROMPT_RUN",
  similes: ["RUN_REPOPROMPT", "REPOPROMPT_COMMAND", "RP_CLI_RUN"],
  description:
    "Run a RepoPrompt CLI command through the configured RepoPrompt service with timeouts and command allowlist checks.",

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    return Boolean(runtime.getService("repoprompt"));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService(
      "repoprompt",
    ) as RepoPromptService | null;
    if (!service) {
      const error =
        "RepoPrompt service is not available. Ensure plugin-repoprompt is enabled.";
      if (callback) {
        await callback({ text: error, source: message.content.source });
      }
      return { success: false, error };
    }

    const runInput = extractRunInput(
      message,
      options as RepoPromptActionOptions,
    );
    if (!runInput) {
      const error =
        "No RepoPrompt command provided. Pass `command`/`args` options or message text like `rp-cli <command> ...`.";
      if (callback) {
        await callback({ text: error, source: message.content.source });
      }
      return { success: false, error };
    }

    try {
      const result = await service.run(runInput);
      const text = summarizeResult(result);

      if (callback) {
        await callback({
          text,
          source: message.content.source,
        });
      }

      return {
        success: result.ok,
        text,
        data: { ...result },
        ...(result.ok
          ? {}
          : {
              error:
                result.stderr ||
                `RepoPrompt exited with code ${String(result.exitCode)}`,
            }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : `Unknown RepoPrompt error: ${String(error)}`;
      logger.error(`REPOPROMPT_RUN failed: ${errorMessage}`);

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
          text: "rp-cli context_builder --response-type plan",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "✅ RepoPrompt command completed.",
          actions: ["REPOPROMPT_RUN"],
        },
      },
    ],
  ],
};
