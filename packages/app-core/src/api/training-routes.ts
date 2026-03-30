import type { AgentRuntime } from "@elizaos/core";
import { isLoopbackHost } from "@miladyai/agent";
import type {
  RouteHelpers,
  RouteRequestContext,
  TrainingServiceLike,
} from "@miladyai/agent/api";
import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "@miladyai/agent/api/training-routes";

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
