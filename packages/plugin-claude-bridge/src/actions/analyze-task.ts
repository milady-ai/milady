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

export const analyzeTaskAction: Action = {
  name: "ANALYZE_TASK",
  similes: [
    "ANALYZE",
    "THINK_ABOUT",
    "PLAN_TASK",
    "ORCHESTRATE",
    "REASON",
    "DECOMPOSE_TASK",
  ],
  description:
    "Submit an analysis or orchestration task to the Claude Agent Service. Use when the user asks you to think through a complex problem, plan a multi-step task, or analyze data.",

  parameters: [
    {
      name: "prompt",
      description: "What to analyze, plan, or reason about",
      required: true,
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

    if (!prompt) {
      if (callback) {
        await callback({
          text: "I need to know what to analyze or plan.",
          actions: [],
        } as Content);
      }
      return { success: false };
    }

    try {
      const { id } = await submitTask("orchestrate", prompt);
      if (callback) {
        await callback({
          text: `Analysis task submitted (id: ${id.slice(0, 8)}). Working on it now.`,
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
        content: { text: "Plan out the steps to refactor the auth system" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "I'll run an analysis on that and come back with a plan.",
          actions: ["ANALYZE_TASK"],
        },
      } as ActionExample,
    ],
  ],
};
