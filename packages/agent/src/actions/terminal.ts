/**
 * RUN_IN_TERMINAL action — runs a shell command on the server.
 *
 * When triggered the action:
 *   1. Extracts the command from the parameters, NL text, or MCP-style JSON
 *   2. POSTs to the local API server to execute it
 *   3. The API broadcasts output via WebSocket for real-time display
 *   4. Returns a descriptive text response
 *
 * @module actions/terminal
 */

import type { Action, HandlerOptions, Memory } from "@elizaos/core";

/** API port for posting terminal requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

const FAIL = { success: false, text: "" } as const;

/**
 * Extract a command from handler options and message text.
 *
 * Resolution order:
 *   1. `parameters.command` — explicit parameter
 *   2. `parameters.arguments` — MCP-style JSON string like `{"command":"ls"}`
 *   3. Natural language extraction from message text
 */
function getCommand(
  options?: HandlerOptions,
  message?: Memory,
): string | undefined {
  const params = options?.parameters as
    | { command?: string; arguments?: string }
    | undefined;

  // 1. Explicit command parameter
  if (params?.command) return params.command;

  // 2. MCP-style JSON arguments
  if (typeof params?.arguments === "string") {
    try {
      const parsed = JSON.parse(params.arguments);
      if (parsed?.command) return parsed.command;
    } catch {
      // Not valid JSON — fall through
    }
  }

  // 3. Extract from natural language (look for common CLI patterns)
  const text = message?.content?.text;
  if (typeof text === "string" && text.length > 0) {
    // Match common shell commands after phrases like "run", "execute", etc.
    // Two-step: capture the phrase, then trim trailing prepositions
    // (e.g. "in the shell", "on the server").
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

  return undefined;
}

export const terminalAction: Action = {
  name: "RUN_IN_TERMINAL",

  similes: [
    "RUN_COMMAND",
    "EXECUTE_COMMAND",
    "TERMINAL",
    "SHELL",
    "RUN_SHELL",
    "EXEC",
    "CALL_MCP_TOOL",
  ],

  description:
    "Run a shell command in the user's terminal. Use this when the user asks " +
    "you to run a command, execute a script, install packages, or perform " +
    "any terminal operation. Output is shown in real time.",

  validate: async () => true,

  handler: async (_runtime, _message, _state, options) => {
    const command = getCommand(
      options as HandlerOptions | undefined,
      _message as Memory | undefined,
    );

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
          }),
        },
      );

      if (!response.ok) {
        return FAIL;
      }

      return {
        text: `Running in terminal: \`${command}\``,
        success: true,
        data: { command },
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
  ],
};

