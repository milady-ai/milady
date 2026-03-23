/**
 * RUN_IN_TERMINAL action — runs a shell command on the server.
 *
 * When triggered the action:
 *   1. Extracts the command from the parameters
 *   2. POSTs to the local API server to execute it
 *   3. The API broadcasts output via WebSocket for real-time display
 *   4. Returns a descriptive text response
 *
 * @module actions/terminal
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for posting terminal requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

function getCommand(options?: HandlerOptions): string | undefined {
  const params = options?.parameters as { command?: string } | undefined;
  return params?.command;
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
  ],

  description:
    "Run a shell command in the user's terminal. Use this when the user asks " +
    "you to run a command, execute a script, install packages, or perform " +
    "any terminal operation. Output is shown in real time.",

  validate: async () => true,

  handler: async (_runtime, _message, _state, options) => {
    const command = getCommand(options as HandlerOptions | undefined);

    if (!command) {
      throw new Error("Missing 'command' parameter for RUN_IN_TERMINAL action.");
    }

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
        throw new Error(`Terminal run failed with HTTP ${response.status}`);
      }

      return {
        text: `Running in terminal: \`${command}\``,
        success: true,
        data: { command },
      };
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
