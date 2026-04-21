/**
 * SHELL_COMMAND action — runs a shell command on the server.
 *
 * When triggered the action:
 *   1. Extracts the command from the parameters, NL text, or MCP-style JSON
 *   2. POSTs to the local API server to execute it
 *   3. The API broadcasts output via WebSocket for real-time display
 *   4. Optionally captures the output and stores it in bounded scratchpad state
 *   5. Returns a descriptive text response
 *
 * @module actions/terminal
 */

import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { hasOwnerAccess } from "../security/access.js";

/** API port for posting terminal requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

const FAIL = { success: false, text: "" } as const;

type TerminalActionParameters = {
  arguments?: unknown;
  command?: unknown;
  shellCommand?: unknown;
  addToScratchpad?: unknown;
  persistToScratchpad?: unknown;
  saveToScratchpad?: unknown;
  scratchpadTitle?: unknown;
  title?: unknown;
};

type TerminalActionInput = {
  command?: string;
  addToScratchpad: boolean;
  scratchpadTitle?: string;
};

type CapturedTerminalRun = {
  command: string;
  runId?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  maxDurationMs?: number;
};

type ScratchpadStoreResult = {
  requested?: boolean;
  stored: boolean;
  replaced?: boolean;
  reason?: string;
  item?: {
    id?: string;
    title?: string;
  };
  snapshot?: {
    items: unknown[];
    maxItems: number;
  };
};

type ScratchpadStoreFn = (
  runtime: IAgentRuntime,
  message: Memory,
  options: {
    fallbackTitle: string;
    content: string;
    sourceType: string;
    sourceId: string;
    sourceLabel: string;
  },
) => Promise<ScratchpadStoreResult>;

let cachedScratchpadStoreFn: ScratchpadStoreFn | null | undefined;

function parseBooleanFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    return /^(true|1|yes|y|on)$/i.test(value.trim());
  }
  return false;
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJsonArguments(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore invalid MCP-style argument payloads and fall back to NL parsing.
  }
  return undefined;
}

function resolveScratchpadRequested(
  params: TerminalActionParameters,
  argumentParams: Record<string, unknown> | undefined,
  message?: Memory,
): boolean {
  return [
    params.addToScratchpad,
    params.persistToScratchpad,
    params.saveToScratchpad,
    argumentParams?.addToScratchpad,
    argumentParams?.persistToScratchpad,
    argumentParams?.saveToScratchpad,
    message?.content?.addToScratchpad,
    message?.content?.persistToScratchpad,
    message?.content?.saveToScratchpad,
  ].some((value) => parseBooleanFlag(value));
}

function resolveScratchpadTitle(
  params: TerminalActionParameters,
  argumentParams: Record<string, unknown> | undefined,
  message?: Memory,
): string | undefined {
  return (
    readStringValue(params.scratchpadTitle) ??
    readStringValue(params.title) ??
    readStringValue(argumentParams?.scratchpadTitle) ??
    readStringValue(argumentParams?.title) ??
    readStringValue(message?.content?.scratchpadTitle) ??
    readStringValue(message?.content?.title)
  );
}

/**
 * Extract a command from handler options and message text.
 *
 * Resolution order:
 *   1. `parameters.command` — explicit parameter
 *   2. `parameters.shellCommand` — explicit alias
 *   3. `parameters.arguments` — MCP-style JSON string like `{"command":"ls"}`
 *   4. Natural language extraction from message text
 */
function getCommand(
  options?: HandlerOptions,
  message?: Memory,
): string | undefined {
  const params = (options?.parameters ?? {}) as TerminalActionParameters;
  const argumentParams = parseJsonArguments(params.arguments);

  const explicitCommand =
    readStringValue(params.command) ??
    readStringValue(params.shellCommand) ??
    readStringValue(argumentParams?.command) ??
    readStringValue(argumentParams?.shellCommand);
  if (explicitCommand) {
    return explicitCommand;
  }

  const text = message?.content?.text;
  if (typeof text === "string" && text.length > 0) {
    const match = text.match(
      /(?:run|execute|start|do)\s+(?:the\s+command\s+)?[`'"]*(.+?)[`'"]*[?.!]?\s*$/i,
    );
    if (match?.[1]) {
      const trimmed = match[1]
        .replace(/\s+(?:in|on|from|to|for|at)\s+(?:the\s+)?[\w\s]+$/i, "")
        .trim();
      if (trimmed) return trimmed;
    }
  }

  const lower = (text ?? "").toLowerCase();
  const cryptoMatch = lower.match(
    /\b(bitcoin|btc|ethereum|eth|solana|sol)\b/,
  );
  if (cryptoMatch) {
    const ids: Record<string, string> = {
      bitcoin: "bitcoin",
      btc: "bitcoin",
      ethereum: "ethereum",
      eth: "ethereum",
      solana: "solana",
      sol: "solana",
    };
    const id = ids[cryptoMatch[1]];
    if (id) {
      return `curl -s "https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true"`;
    }
  }
  if (/\b(?:disk|space|storage)\b/i.test(lower)) return "df -h /home/milady";
  if (/\b(?:uptime|load)\b/i.test(lower)) return "uptime";
  if (/\b(?:memory|ram)\b/i.test(lower)) return "free -h";
  if (/\b(?:process|top|memory.*usage)\b/i.test(lower)) {
    return "ps aux --sort=-rss | head -15";
  }

  return undefined;
}

function resolveTerminalInput(
  options?: HandlerOptions,
  message?: Memory,
): TerminalActionInput {
  const params = (options?.parameters ?? {}) as TerminalActionParameters;
  const argumentParams = parseJsonArguments(params.arguments);

  return {
    command: getCommand(options, message),
    addToScratchpad: resolveScratchpadRequested(
      params,
      argumentParams,
      message,
    ),
    scratchpadTitle: resolveScratchpadTitle(params, argumentParams, message),
  };
}

function normalizeCapturedRun(
  command: string,
  value: unknown,
): CapturedTerminalRun {
  const data =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const exitCode =
    typeof data.exitCode === "number" && Number.isFinite(data.exitCode)
      ? data.exitCode
      : Number(data.exitCode ?? 0) || 0;

  return {
    command,
    runId: readStringValue(data.runId),
    exitCode,
    stdout: typeof data.stdout === "string" ? data.stdout : "",
    stderr: typeof data.stderr === "string" ? data.stderr : "",
    timedOut: data.timedOut === true,
    truncated: data.truncated === true,
    maxDurationMs:
      typeof data.maxDurationMs === "number" && Number.isFinite(data.maxDurationMs)
        ? data.maxDurationMs
        : undefined,
  };
}

async function getScratchpadStoreFn(): Promise<ScratchpadStoreFn | null> {
  if (cachedScratchpadStoreFn !== undefined) {
    return cachedScratchpadStoreFn;
  }

  try {
    const mod = (await import("@elizaos/plugin-scratchpad")) as {
      maybeStoreTaskScratchpadItem?: ScratchpadStoreFn;
    };
    cachedScratchpadStoreFn =
      typeof mod.maybeStoreTaskScratchpadItem === "function"
        ? mod.maybeStoreTaskScratchpadItem
        : null;
  } catch (error) {
    cachedScratchpadStoreFn = null;
    logger.warn(
      `[terminal] Scratchpad plugin unavailable; shell output will not be persisted (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  return cachedScratchpadStoreFn;
}

function formatOutputBlock(content: string): string {
  return content.trimEnd() || "(empty)";
}

function buildCommandArtifactContent(result: CapturedTerminalRun): string {
  return [
    `Command: ${result.command}`,
    `Exit code: ${result.exitCode}`,
    result.timedOut
      ? `Timed out: yes${typeof result.maxDurationMs === "number" ? ` (${result.maxDurationMs} ms limit)` : ""}`
      : "Timed out: no",
    result.truncated ? "Captured output truncated to 128 KB." : "",
    "",
    "STDOUT:",
    formatOutputBlock(result.stdout),
    "",
    "STDERR:",
    formatOutputBlock(result.stderr),
  ]
    .filter(Boolean)
    .join("\n");
}

async function maybeStoreCommandOutput(
  runtime: IAgentRuntime | undefined,
  message: Memory,
  input: TerminalActionInput,
  result: CapturedTerminalRun,
) {
  if (!input.addToScratchpad) {
    return {
      requested: false,
      stored: false,
    } as const;
  }

  if (!runtime) {
    return {
      requested: true,
      stored: false,
      reason:
        "Runtime unavailable; command output could not be added to the scratchpad.",
    } as const;
  }

  const scratchpadMessage = {
    ...message,
    content: {
      ...message.content,
      addToScratchpad: true,
      ...(input.scratchpadTitle
        ? { scratchpadTitle: input.scratchpadTitle }
        : {}),
    },
  } as Memory;

  const storeScratchpadItem = await getScratchpadStoreFn();
  if (!storeScratchpadItem) {
    return {
      requested: true,
      stored: false,
      reason:
        "Scratchpad plugin unavailable; command output could not be added to the scratchpad.",
    } as const;
  }

  return storeScratchpadItem(runtime, scratchpadMessage, {
    fallbackTitle: input.scratchpadTitle ?? result.command,
    content: buildCommandArtifactContent(result),
    sourceType: "command",
    sourceId: result.command,
    sourceLabel: result.command,
  });
}

function buildCapturedResponseText(
  result: CapturedTerminalRun,
  scratchpadResult: Awaited<ReturnType<typeof maybeStoreCommandOutput>>,
): string {
  const scratchpadItem = scratchpadResult.stored ? scratchpadResult.item : undefined;
  const scratchpadSnapshot = scratchpadResult.stored
    ? scratchpadResult.snapshot
    : undefined;

  return [
    `Executed shell command: \`${result.command}\``,
    `Exit code: ${result.exitCode}`,
    result.timedOut
      ? `Timed out${typeof result.maxDurationMs === "number" ? ` after ${result.maxDurationMs} ms` : ""}.`
      : "",
    result.truncated ? "Captured output truncated to 128 KB." : "",
    scratchpadResult.requested
      ? scratchpadResult.stored
        ? `${scratchpadResult.replaced ? "Updated" : "Added"} scratchpad item ${scratchpadItem?.id ?? "unknown"}: ${scratchpadItem?.title ?? result.command}`
        : `Scratchpad add skipped: ${scratchpadResult.reason}`
      : "",
    scratchpadSnapshot
      ? `Scratchpad usage: ${scratchpadSnapshot.items.length}/${scratchpadSnapshot.maxItems}.`
      : "",
    scratchpadSnapshot
      ? "Clear unused scratchpad state when it is no longer needed."
      : "",
    "",
    "STDOUT:",
    formatOutputBlock(result.stdout),
    "",
    "STDERR:",
    formatOutputBlock(result.stderr),
  ]
    .filter(Boolean)
    .join("\n");
}

export const terminalAction: Action = {
  name: "SHELL_COMMAND",

  similes: [
    "RUN_IN_TERMINAL",
    "RUN_COMMAND",
    "EXECUTE_COMMAND",
    "TERMINAL",
    "SHELL",
    "RUN_SHELL",
    "EXEC",
    "CALL_MCP_TOOL",
  ],

  description:
    "Run a single explicit shell command that the user provided directly. " +
    "Only use when the user gives a specific command like 'run ls -la' or 'execute npm install'. " +
    "Do NOT use for building projects, creating websites, or multi-step work — use CREATE_TASK instead. " +
    "Set addToScratchpad=true to capture the command output, return it inline, and store it in bounded scratchpad state.",

  validate: async (runtime, message) => {
    if (!(await hasOwnerAccess(runtime, message))) {
      return false;
    }

    const text = (message?.content?.text ?? "").trim();
    if (!text) return false;
    if (/`[^`]+`/.test(text)) return true;
    if (/```/.test(text)) return true;
    if (/\b(?:run|execute)\s+\S/i.test(text)) return true;
    if (
      /\b(?:price|worth|cost|balance|disk|uptime|status|check|curl|fetch|tail|head|log)\b/i.test(
        text,
      )
    ) {
      return true;
    }
    return false;
  },

  handler: async (runtime, message, _state, options) => {
    if (!(await hasOwnerAccess(runtime, message))) {
      return {
        success: false,
        text: "Permission denied: only the owner may run terminal commands.",
      };
    }

    const input = resolveTerminalInput(
      options as HandlerOptions | undefined,
      message as Memory | undefined,
    );
    const command = input.command;

    if (!command) {
      return FAIL;
    }

    try {
      const response = await fetch(
        `http://localhost:${API_PORT}/api/terminal/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            clientId: "runtime-terminal-action",
            ...(input.addToScratchpad ? { captureOutput: true } : {}),
          }),
        },
      );

      if (!response.ok) {
        return FAIL;
      }

      if (!input.addToScratchpad) {
        return {
          text: `Running in terminal: \`${command}\``,
          success: true,
          data: { command },
        };
      }

      const capturedRun = normalizeCapturedRun(command, await response.json());
      const scratchpadResult = await maybeStoreCommandOutput(
        runtime as IAgentRuntime | undefined,
        message as Memory,
        input,
        capturedRun,
      );

      return {
        text: buildCapturedResponseText(capturedRun, scratchpadResult),
        success: true,
        data: {
          ...capturedRun,
          scratchpad: scratchpadResult,
        },
      };
    } catch {
      return FAIL;
    }
  },

  parameters: [
    {
      name: "command",
      description: "The shell command to execute in the terminal",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "addToScratchpad",
      description:
        "When true, wait for the command to finish, capture stdout/stderr, and store the result in bounded scratchpad state.",
      required: false,
      schema: { type: "boolean" as const },
    },
    {
      name: "scratchpadTitle",
      description:
        "Optional scratchpad title to use when addToScratchpad=true.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
