import type http from "node:http";
import type { AgentRuntime, UUID } from "@elizaos/core";
import type { ReadJsonBodyOptions } from "./http-helpers.js";
import type {
  CompleteLifeOpsOccurrenceRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  SnoozeLifeOpsOccurrenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "../contracts/lifeops.js";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";

export interface LifeOpsRouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  state: {
    runtime: AgentRuntime | null;
    adminEntityId: UUID | null;
  };
  json: (res: http.ServerResponse, data: unknown, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    options?: ReadJsonBodyOptions,
  ) => Promise<T | null>;
  decodePathComponent: (
    raw: string,
    res: http.ServerResponse,
    label: string,
  ) => string | null;
}

function getService(ctx: LifeOpsRouteContext): LifeOpsService | null {
  if (!ctx.state.runtime) {
    ctx.error(ctx.res, "Agent runtime is not available", 503);
    return null;
  }
  return new LifeOpsService(ctx.state.runtime);
}

async function runRoute(
  ctx: LifeOpsRouteContext,
  fn: (service: LifeOpsService) => Promise<void>,
): Promise<boolean> {
  const service = getService(ctx);
  if (!service) return true;
  try {
    await fn(service);
    return true;
  } catch (error) {
    if (error instanceof LifeOpsServiceError) {
      ctx.error(ctx.res, error.message, error.status);
      return true;
    }
    throw error;
  }
}

export async function handleLifeOpsRoutes(
  ctx: LifeOpsRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, json, readJsonBody, decodePathComponent } = ctx;

  if (method === "GET" && pathname === "/api/lifeops/overview") {
    return runRoute(ctx, async (service) => {
      json(res, await service.getOverview());
    });
  }

  if (method === "GET" && pathname === "/api/lifeops/definitions") {
    return runRoute(ctx, async (service) => {
      json(res, { definitions: await service.listDefinitions() });
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/definitions") {
    const body = await readJsonBody<CreateLifeOpsDefinitionRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.createDefinition(body), 201);
    });
  }

  const definitionMatch = pathname.match(/^\/api\/lifeops\/definitions\/([^/]+)$/);
  if (definitionMatch) {
    const definitionId = decodePathComponent(definitionMatch[1], res, "definition id");
    if (!definitionId) return true;
    if (method === "GET") {
      return runRoute(ctx, async (service) => {
        json(res, await service.getDefinition(definitionId));
      });
    }
    if (method === "PUT") {
      const body = await readJsonBody<UpdateLifeOpsDefinitionRequest>(req, res);
      if (!body) return true;
      return runRoute(ctx, async (service) => {
        json(res, await service.updateDefinition(definitionId, body));
      });
    }
  }

  if (method === "GET" && pathname === "/api/lifeops/goals") {
    return runRoute(ctx, async (service) => {
      json(res, { goals: await service.listGoals() });
    });
  }

  if (method === "POST" && pathname === "/api/lifeops/goals") {
    const body = await readJsonBody<CreateLifeOpsGoalRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, await service.createGoal(body), 201);
    });
  }

  const goalMatch = pathname.match(/^\/api\/lifeops\/goals\/([^/]+)$/);
  if (goalMatch) {
    const goalId = decodePathComponent(goalMatch[1], res, "goal id");
    if (!goalId) return true;
    if (method === "GET") {
      return runRoute(ctx, async (service) => {
        json(res, await service.getGoal(goalId));
      });
    }
    if (method === "PUT") {
      const body = await readJsonBody<UpdateLifeOpsGoalRequest>(req, res);
      if (!body) return true;
      return runRoute(ctx, async (service) => {
        json(res, await service.updateGoal(goalId, body));
      });
    }
  }

  const completeMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/complete$/);
  if (method === "POST" && completeMatch) {
    const occurrenceId = decodePathComponent(
      completeMatch[1],
      res,
      "occurrence id",
    );
    if (!occurrenceId) return true;
    const body = await readJsonBody<CompleteLifeOpsOccurrenceRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.completeOccurrence(occurrenceId, body),
      });
    });
  }

  const skipMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/skip$/);
  if (method === "POST" && skipMatch) {
    const occurrenceId = decodePathComponent(skipMatch[1], res, "occurrence id");
    if (!occurrenceId) return true;
    const body = await readJsonBody<Record<string, never>>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.skipOccurrence(occurrenceId),
      });
    });
  }

  const snoozeMatch = pathname.match(/^\/api\/lifeops\/occurrences\/([^/]+)\/snooze$/);
  if (method === "POST" && snoozeMatch) {
    const occurrenceId = decodePathComponent(
      snoozeMatch[1],
      res,
      "occurrence id",
    );
    if (!occurrenceId) return true;
    const body = await readJsonBody<SnoozeLifeOpsOccurrenceRequest>(req, res);
    if (!body) return true;
    return runRoute(ctx, async (service) => {
      json(res, {
        occurrence: await service.snoozeOccurrence(occurrenceId, body),
      });
    });
  }

  return false;
}
