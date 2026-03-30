import type { AgentRuntime } from "@elizaos/core";
import type { RouteRequestContext } from "@miladyai/agent/api";
import {
  type PermissionRouteState as AutonomousPermissionRouteState,
  handlePermissionRoutes as handleAutonomousPermissionRoutes,
} from "@miladyai/agent/api/permissions-routes";
import type { ElizaConfig } from "../config/config";

export interface PermissionState {
  id: string;
  status: string;
  lastChecked: number;
  canRequest: boolean;
}

export interface PermissionRouteState {
  runtime: AgentRuntime | null;
  config: ElizaConfig;
  permissionStates?: Record<string, PermissionState>;
  shellEnabled?: boolean;
}

export interface PermissionRouteContext extends RouteRequestContext {
  state: PermissionRouteState;
  saveConfig: (config: ElizaConfig) => void;
  scheduleRuntimeRestart: (reason: string) => void;
}

function toAutonomousState(
  state: PermissionRouteState,
): AutonomousPermissionRouteState {
  return state;
}

export async function handlePermissionRoutes(
  ctx: PermissionRouteContext,
): Promise<boolean> {
  return handleAutonomousPermissionRoutes({
    ...ctx,
    state: toAutonomousState(ctx.state),
    saveConfig: (config) => ctx.saveConfig(config as ElizaConfig),
  });
}
