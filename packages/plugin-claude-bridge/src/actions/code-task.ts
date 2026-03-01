import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { submitTask } from "../agent-client.ts";

export const codeTaskAction: Action = {
  name: "CODE_TASK",
  similes: [
    "CODING_TASK",
    "RUN_CODE",
    "WRITE_CODE",
    "FIX_CODE",
    "REVIEW_CODE",
    "RUN_IN_TERMINAL",
    "EXECUTE_COMMAND",
    "TERMINAL",
    "SHELL",
    "RUN_COMMAND",
    "RUN_SHELL",
    "EXEC",
  ],
  description:
    "Submit a coding task to the Claude Agent Service. Use when the user asks you to write code, fix bugs, review code, run shell commands, or do file operations.",

  parameters: [
    {
      name: "prompt",
      description: "What to code, fix, review, or execute",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "cwd",
      description: "Working directory for the task",
      required: false,
      schema: { type: "string" },
    },
  ],

  validate: async (): Promise<boolean> => true,

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    const params = (options as Record<string, unknown> | undefined) ?? {};
    const prompt = String(
      params.prompt ?? message?.content?.text ?? "",
    ).trim();
    const cwd = params.cwd ? String(params.cwd) : "/opt/apps";

    if (!prompt) {
      if (callback) {
        await callback({
          text: "I need to know what coding task to perform.",
          actions: [],
        } as Content);
      }
      return { success: false };
    }

    try {
      const { id } = await submitTask("coding", prompt, cwd);
      if (callback) {
        await callback({
          text: `Coding task submitted (id: ${id.slice(0, 8)}). I'll let you know when it's done.`,
          actions: [],
        } as Content);
      }
      return { success: true, data: { taskId: id } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({
          text: `Agent service is not reachable: ${msg}`,
          actions: [],
        } as Content);
      }
      return { success: false };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Write a Python hello world script in /tmp" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "I'll submit that as a coding task to the agent service.",
          actions: ["CODE_TASK"],
        },
      } as ActionExample,
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Fix the bug in /opt/apps/myapp/src/index.ts" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Let me delegate that to the coding agent.",
          actions: ["CODE_TASK"],
        },
      } as ActionExample,
    ],
  ],
};
