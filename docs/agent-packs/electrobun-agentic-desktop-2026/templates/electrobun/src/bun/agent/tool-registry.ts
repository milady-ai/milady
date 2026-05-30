import type { AgentRunInput, AgentRunOutput } from "../../shared/rpc";
import type { Permission, Result } from "../../shared/domain";

export type ToolDefinition<I, O> = {
  name: string;
  description: string;
  permissions: Permission[];
  timeoutMs: number;
  validate(input: unknown): I;
  execute(input: I, context: { signal: AbortSignal }): Promise<Result<O>>;
};

export function createToolRegistry() {
  return {
    listTools() {
      return ["notes.search", "updates.check"] as const;
    },
    planDeterministic(input: AgentRunInput): AgentRunOutput {
      return {
        summary: `No model route configured. Created a deterministic plan for: ${input.prompt.slice(0, 120)}`,
        proposedActions: [
          {
            id: "settings.open",
            title: "Open model provider settings",
            requiresConfirmation: false,
            permissions: ["system:open-window"],
          },
        ],
      };
    },
  };
}
