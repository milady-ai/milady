import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import type { MoltbookService } from "../services/moltbook-service.ts";

export const moltbookStatusProvider: Provider = {
  name: "MOLTBOOK_STATUS",
  description:
    "Provides Moltbook plugin status, auth state, and recent request metadata.",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
  ): Promise<ProviderResult> => {
    const service = runtime.getService("moltbook") as MoltbookService | null;
    if (!service) {
      return {
        text: "Moltbook plugin is not active (service not found).",
        values: { moltbookAvailable: false },
        data: { available: false },
      };
    }

    const status = service.getStatus();
    const lines = [
      `Moltbook API base: ${status.apiBaseUrl}`,
      `Moltbook service availability: ${status.available ? "available" : "unavailable"}`,
      `API key configured: ${status.hasApiKey ? "yes" : "no"}`,
      `Credentials path: ${status.credentialsPath}`,
      `Timeout: ${status.timeoutMs}ms`,
    ];

    if (status.agentName) {
      lines.push(`Agent name: ${status.agentName}`);
    }
    if (status.lastPath) {
      lines.push(`Last path: ${status.lastPath}`);
    }
    if (typeof status.lastStatus === "number") {
      lines.push(`Last status: ${status.lastStatus}`);
    }

    return {
      text: lines.join("\n"),
      values: {
        moltbookAvailable: status.available,
        moltbookHasApiKey: status.hasApiKey,
      },
      data: { ...status },
    };
  },
};
