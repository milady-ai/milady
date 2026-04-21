import type { IAgentRuntime, Memory } from "@elizaos/core";
import { syncWebsiteBlockerExpiryTask } from "@miladyai/plugin-selfcontrol";
import {
  getSelfControlStatus,
  parseSelfControlBlockRequest,
  startSelfControlBlock,
  stopSelfControlBlock,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import type { RouteRequestContext } from "./route-helpers.js";

type WebsiteBlockerRequestBody = {
  websites?: string[] | string;
  durationMinutes?: number | string | null;
  text?: string;
};

export interface WebsiteBlockerRouteContext extends RouteRequestContext {
  runtime?: IAgentRuntime | null;
}

function toSyntheticMessage(text: string | undefined): Memory | undefined {
  if (typeof text !== "string" || text.trim().length === 0) {
    return undefined;
  }

  return {
    content: {
      text,
    },
  } as Memory;
}

function buildBlockRequest(
  body: WebsiteBlockerRequestBody,
): ReturnType<typeof parseSelfControlBlockRequest> {
  const parameters: {
    websites?: string[] | string;
    durationMinutes?: number | string | null;
  } = {};

  if (body.websites !== undefined) {
    parameters.websites = body.websites;
  }
  if (body.durationMinutes !== undefined) {
    parameters.durationMinutes = body.durationMinutes;
  }

  return parseSelfControlBlockRequest(
    {
      parameters,
    },
    toSyntheticMessage(body.text),
  );
}

export async function handleWebsiteBlockerRoutes(
  ctx: WebsiteBlockerRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error, runtime } =
    ctx;

  if (
    pathname !== "/api/website-blocker" &&
    pathname !== "/api/website-blocker/status"
  ) {
    return false;
  }

  if (method === "GET") {
    json(res, await getSelfControlStatus());
    return true;
  }

  if (method === "POST" || method === "PUT") {
    const body = await readJsonBody<WebsiteBlockerRequestBody>(req, res);
    if (!body) return true;

    const parsed = buildBlockRequest(body);
    if (!parsed.request) {
      json(
        res,
        {
          success: false,
          error:
            parsed.error ?? "Could not parse the website block request body.",
        },
        400,
      );
      return true;
    }

    if (parsed.request.durationMinutes !== null && !runtime) {
      error(
        res,
        "Timed website blocks require the Eliza runtime so Milady can schedule the automatic unblock task.",
        503,
      );
      return true;
    }

    const result = await startSelfControlBlock({
      ...parsed.request,
      scheduledByAgentId: runtime ? String(runtime.agentId) : null,
    });
    if (result.success === true) {
      if (parsed.request.durationMinutes !== null && runtime) {
        try {
          const taskId = await syncWebsiteBlockerExpiryTask(runtime);
          if (!taskId) {
            await stopSelfControlBlock();
            json(
              res,
              {
                success: false,
                error:
                  "Milady started the website block but could not schedule its automatic unblock task, so it rolled the block back.",
              },
              500,
            );
            return true;
          }
        } catch (scheduleError) {
          await stopSelfControlBlock();
          json(
            res,
            {
              success: false,
              error: `Milady could not schedule the automatic unblock task, so it rolled the website block back. ${scheduleError instanceof Error ? scheduleError.message : String(scheduleError)}`,
            },
            500,
          );
          return true;
        }
      }

      json(
        res,
        {
          success: true,
          endsAt: result.endsAt,
          request: parsed.request,
        },
        200,
      );
    } else {
      json(
        res,
        {
          success: false,
          error: result.error,
          status: result.status,
        },
        409,
      );
    }
    return true;
  }

  if (method === "DELETE") {
    const result = await stopSelfControlBlock();
    if (result.success === true) {
      json(
        res,
        {
          success: true,
          removed: result.removed,
          status: result.status,
        },
        200,
      );
    } else {
      json(
        res,
        {
          success: false,
          error: result.error,
          status: result.status,
        },
        409,
      );
    }
    return true;
  }

  return false;
}
