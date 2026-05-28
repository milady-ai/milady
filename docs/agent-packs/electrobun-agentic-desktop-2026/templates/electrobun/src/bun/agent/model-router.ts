import type { AgentRunInput, AgentRunOutput } from "../../shared/rpc";
import type { createToolRegistry } from "./tool-registry";
import { getSecret } from "../storage/secrets";

export type ModelRoute =
  | { kind: "deterministic" }
  | {
      kind: "byok-cloud" | "local";
      generateStructured(
        input: AgentRunInput,
        context: { signal: AbortSignal; tools: ReturnType<typeof createToolRegistry> },
      ): Promise<AgentRunOutput>;
    };

export function createModelRouter() {
  return {
    async selectRoute(input: AgentRunInput): Promise<ModelRoute> {
      if (input.mode === "dry-run" || input.prompt.length < 12) return { kind: "deterministic" };
      const providerKey = await getSecret("model-provider-api-key");
      if (!providerKey) return { kind: "deterministic" };
      return {
        kind: "byok-cloud",
        async generateStructured(request) {
          // Replace this stub with a provider implementation that:
          // - uses fetch with AbortSignal
          // - redacts secrets
          // - validates structured JSON output
          // - never logs prompts/transcripts by default
          return {
            summary: `Draft response for: ${request.prompt.slice(0, 80)}`,
            proposedActions: [],
          };
        },
      };
    },
  };
}
