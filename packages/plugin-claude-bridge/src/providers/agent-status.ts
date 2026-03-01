import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { isAgentOnline } from "../agent-client.ts";

export const agentStatusProvider = {
  name: "claude-agent-status",
  description: "Status of the Claude Agent Service for coding and deployment",

  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const online = await isAgentOnline();

    if (online) {
      return {
        text: [
          "## Claude Agent Service",
          "The Claude Agent Service is online at " +
            (process.env.CLAUDE_AGENT_URL ?? "http://localhost:3100") +
            ".",
          "You can delegate tasks using these actions:",
          "- CODE_TASK — coding, file ops, shell commands, code review",
          "- DEPLOY_TASK — application deployment, service updates",
          "- ANALYZE_TASK — planning, reasoning, multi-step analysis",
        ].join("\n"),
      };
    }

    return {
      text: [
        "## Claude Agent Service",
        "The Claude Agent Service is currently offline.",
        "Coding, deployment, and analysis actions are unavailable.",
      ].join("\n"),
    };
  },
} satisfies Provider;
