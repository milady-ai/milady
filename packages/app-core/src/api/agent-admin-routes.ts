import type { RouteHelpers, RouteRequestMeta } from "@miladyai/agent/api";
import {
  type AgentAdminRouteState,
  handleAgentAdminRoutes as handleAutonomousAgentAdminRoutes,
} from "@miladyai/agent/api/agent-admin-routes";
import type { ElizaConfig } from "../config/config";

export type { AgentAdminRouteState };

export interface AgentAdminRouteContext
  extends Omit<
      import("@miladyai/agent/api/agent-admin-routes").AgentAdminRouteContext,
      "state"
    >,
    RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  state: AgentAdminRouteState & { config: ElizaConfig };
}

export async function handleAgentAdminRoutes(
  ctx: AgentAdminRouteContext,
): Promise<boolean> {
  return handleAutonomousAgentAdminRoutes(ctx);
}
