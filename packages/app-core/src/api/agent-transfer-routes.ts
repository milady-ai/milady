import type { RouteRequestContext } from "@miladyai/agent/api";
import {
  type AgentTransferRouteState,
  type AgentTransferRouteContext as AutonomousAgentTransferRouteContext,
  handleAgentTransferRoutes as handleAutonomousAgentTransferRoutes,
} from "@miladyai/agent/api/agent-transfer-routes";
import {
  AgentExportError,
  estimateExportSize,
  exportAgent,
  importAgent,
} from "@miladyai/agent/services";

export type { AgentTransferRouteState };

export interface AgentTransferRouteContext extends RouteRequestContext {
  state: AgentTransferRouteState;
}

function toAutonomousContext(
  ctx: AgentTransferRouteContext,
): AutonomousAgentTransferRouteContext {
  return {
    ...ctx,
    exportAgent,
    estimateExportSize,
    importAgent,
    isAgentExportError: (error: unknown) => error instanceof AgentExportError,
  };
}

export async function handleAgentTransferRoutes(
  ctx: AgentTransferRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentTransferRoutes(toAutonomousContext(ctx));
}
