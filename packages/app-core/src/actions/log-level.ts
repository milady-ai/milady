import {
  type Action,
  elizaLogger,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";

export const logLevelAction: Action = {
  name: "LOG_LEVEL",
  similes: [
    "SET_LOG_LEVEL",
    "CHANGE_LOG_LEVEL",
    "DEBUG_MODE",
    "SET_DEBUG",
    "CONFIGURE_LOGGING",
  ],
  description:
    "Set the log level for the current session (trace, debug, info, warn, error).",
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = (message.content.text || "").toLowerCase();
    const hasLevel = /\b(trace|debug|info|warn|error)\b/.test(text);
    if (!hasLevel) {
      return false;
    }

    return (
      /\/loglevel\b/.test(text) ||
      /\blog(?:ging)?\s+level\b/.test(text) ||
      (/\b(set|change|switch)\b/.test(text) &&
        /\b(log(?:ging)?|verbosity)\b/.test(text))
    );
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback,
  ): Promise<import("@elizaos/core").ActionResult> => {
    const text = (message.content.text || "").toLowerCase();
    const levels = ["trace", "debug", "info", "warn", "error"] as const;

    // Extract level from text
    const level = levels.find((candidate) =>
      new RegExp(`\\b${candidate}\\b`).test(text),
    );

    if (!level) {
      if (callback) {
        callback({
          text: `Please specify a valid log level: ${levels.join(", ")}.`,
          action: "LOG_LEVEL_FAILED",
        });
      }
      return { success: false, error: "Invalid log level" };
    }

    // Set the override
    const runtimeWithOverrides = runtime as IAgentRuntime & {
      logLevelOverrides?: Map<string, string>;
    };

    if (runtimeWithOverrides.logLevelOverrides) {
      runtimeWithOverrides.logLevelOverrides.set(message.roomId, level);
      elizaLogger.info(`Log level set to ${level} for room ${message.roomId}`);

      if (callback) {
        callback({
          text: `Log level changed to **${level.toUpperCase()}** for this room.`,
          action: "LOG_LEVEL_SET",
        });
      }
      return { success: true };
    } else {
      if (callback) {
        callback({
          text: "Dynamic log levels are not supported by this runtime version.",
          action: "LOG_LEVEL_FAILED",
        });
      }
      return { success: false, error: "Not supported" };
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "/logLevel debug" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Log level changed to **DEBUG** for this room.",
          action: "LOG_LEVEL_SET",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Set log level to trace" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "Log level changed to **TRACE** for this room.",
          action: "LOG_LEVEL_SET",
        },
      },
    ],
  ],
};
