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

export const deployTaskAction: Action = {
  name: "DEPLOY_TASK",
  similes: [
    "DEPLOY",
    "DEPLOY_APP",
    "DEPLOY_SERVICE",
    "SHIP_IT",
    "PUSH_TO_PRODUCTION",
  ],
  description:
    "Submit a deployment task to the Claude Agent Service. Use when the user asks you to deploy an application, update a service, or push changes to production.",

  parameters: [
    {
      name: "prompt",
      description: "What to deploy and where",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "cwd",
      description: "Working directory for the deployment",
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
          text: "I need to know what to deploy.",
          actions: [],
        } as Content);
      }
      return { success: false };
    }

    try {
      const { id } = await submitTask("deploy", prompt, cwd);
      if (callback) {
        await callback({
          text: `Deploy task submitted (id: ${id.slice(0, 8)}). I'll report back when it's complete.`,
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
        content: { text: "Deploy the app to production" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "I'll submit a deployment task now.",
          actions: ["DEPLOY_TASK"],
        },
      } as ActionExample,
    ],
  ],
};
