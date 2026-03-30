/**
 * Local stubs for types removed from @elizaos/plugin-agent-orchestrator 2.x.
 * Used as structural types for the SwarmCoordinator callbacks;
 * no runtime import from the plugin is needed.
 */

// biome-ignore lint/suspicious/noExplicitAny: legacy coordinator event payload
export type SwarmEvent = Record<string, any>;

// biome-ignore lint/suspicious/noExplicitAny: legacy coordinator task context
export type TaskContext = Record<string, any>;

export interface TaskCompletionSummary {
  sessionId: string;
  label: string;
  agentType: string;
  originalTask: string;
  status: string;
  completionSummary: string;
  [key: string]: unknown;
}
