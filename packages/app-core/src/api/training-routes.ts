import type { AgentRuntime } from "@elizaos/core";
import { isLoopbackHost } from "../../../agent/src/security/network-policy";
import type {
  RouteHelpers,
  RouteRequestContext,
} from "../../../agent/src/api/route-helpers";
import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "../../../agent/src/api/training-routes";
import type { TrainingServiceLike } from "../../../agent/src/api/training-service-like";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  return handleAutonomousTrainingRoutes({
    ...ctx,
    isLoopbackHost,
  });
}
