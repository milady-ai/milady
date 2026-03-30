import type { AgentRuntime } from "@elizaos/core";
import type { RouteRequestContext } from "@miladyai/agent/api";
import { handleMemoryRoutes as handleAutonomousMemoryRoutes } from "@miladyai/agent/api/memory-routes";

export interface MemoryRouteContext extends RouteRequestContext {
  url: URL;
  runtime: AgentRuntime | null;
  agentName: string;
}

export async function handleMemoryRoutes(
  ctx: MemoryRouteContext,
): Promise<boolean> {
  return handleAutonomousMemoryRoutes(ctx);
}
