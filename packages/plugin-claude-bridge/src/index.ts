/**
 * @milady/plugin-claude-bridge — Bridge to Claude Agent Service.
 *
 * Replaces plugin-coding-agent, plugin-shell, and plugin-agent-orchestrator
 * with a thin HTTP bridge to the standalone Claude Agent Service.
 *
 * The agent service runs independently at port 3100 and handles:
 * - Coding tasks via Claude Agent SDK
 * - Analysis/orchestration via Anthropic API + tool_use
 * - Deployment tasks
 *
 * This plugin is optional — the agent service works standalone with its own
 * Web UI, CLI, and HTTP API. This plugin adds ElizaOS chat integration.
 */

import type {
  IAgentRuntime,
  Plugin,
} from "@elizaos/core";
import { codeTaskAction } from "./actions/code-task.ts";
import { deployTaskAction } from "./actions/deploy-task.ts";
import { analyzeTaskAction } from "./actions/analyze-task.ts";
import { agentStatusProvider } from "./providers/agent-status.ts";
import { getAgentUrl, isAgentOnline } from "./agent-client.ts";

const TAG = "[claude-bridge]";

export const claudeBridgePlugin: Plugin = {
  name: "claude-bridge",
  description:
    "Bridge to Claude Agent Service for coding, deployment, and analysis tasks",

  config: {
    CLAUDE_AGENT_URL: process.env.CLAUDE_AGENT_URL ?? "http://localhost:3100",
  },

  actions: [codeTaskAction, deployTaskAction, analyzeTaskAction],

  providers: [agentStatusProvider],

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    const url = getAgentUrl();
    const online = await isAgentOnline();

    if (online) {
      runtime.logger.info(`${TAG} Agent service connected at ${url}`);
    } else {
      runtime.logger.warn(
        `${TAG} Agent service not reachable at ${url} — actions will fail gracefully`,
      );
    }
  },

  cleanup: async () => {
    // Nothing to clean up — stateless HTTP bridge
  },
};

// Re-export for direct imports
export { codeTaskAction } from "./actions/code-task.ts";
export { deployTaskAction } from "./actions/deploy-task.ts";
export { analyzeTaskAction } from "./actions/analyze-task.ts";

export default claudeBridgePlugin;
