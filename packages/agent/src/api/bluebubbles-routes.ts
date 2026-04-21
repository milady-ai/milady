import type http from "node:http";
import type { RouteHelpers } from "./route-helpers.js";

const BLUEBUBBLES_SERVICE_NAME = "bluebubbles";
const DEFAULT_WEBHOOK_PATH = "/webhooks/bluebubbles";
const MAX_BODY_BYTES = 1_048_576;

type BlueBubblesWebhookPayload = {
  type: string;
  data: Record<string, unknown>;
};

interface BlueBubblesServiceLike {
  isConnected(): boolean;
  getWebhookPath(): string;
  handleWebhook(payload: BlueBubblesWebhookPayload): Promise<void>;
}

export interface BlueBubblesRouteState {
  runtime?: {
    getService(type: string): unknown;
  };
}

function resolveService(
  state: BlueBubblesRouteState,
): BlueBubblesServiceLike | null {
  if (!state.runtime) {
    return null;
  }
  const raw = state.runtime.getService(BLUEBUBBLES_SERVICE_NAME);
  return (raw as BlueBubblesServiceLike | null | undefined) ?? null;
}

export function resolveBlueBubblesWebhookPath(
  state: BlueBubblesRouteState,
): string {
  const service = resolveService(state);
  const configuredPath = service?.getWebhookPath();
  if (typeof configuredPath === "string" && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }
  return DEFAULT_WEBHOOK_PATH;
}

export async function handleBlueBubblesRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: BlueBubblesRouteState,
  helpers: RouteHelpers,
): Promise<boolean> {
  const webhookPath = resolveBlueBubblesWebhookPath(state);
  const isWebhookPath = pathname === webhookPath;
  const isApiPath = pathname.startsWith("/api/bluebubbles");

  if (!isWebhookPath && !isApiPath) {
    return false;
  }

  if (method === "GET" && pathname === "/api/bluebubbles/status") {
    const service = resolveService(state);
    if (!service) {
      helpers.json(res, {
        available: false,
        connected: false,
        webhookPath,
        reason: "bluebubbles service not registered",
      });
      return true;
    }

    helpers.json(res, {
      available: true,
      connected: service.isConnected(),
      webhookPath: service.getWebhookPath(),
    });
    return true;
  }

  if (method === "POST" && isWebhookPath) {
    const service = resolveService(state);
    if (!service) {
      helpers.error(res, "bluebubbles service not registered", 503);
      return true;
    }

    const payload = await helpers.readJsonBody<BlueBubblesWebhookPayload>(
      req,
      res,
      { maxBytes: MAX_BODY_BYTES },
    );
    if (!payload) {
      return true;
    }

    if (
      typeof payload.type !== "string" ||
      !payload.type.trim() ||
      typeof payload.data !== "object" ||
      payload.data === null ||
      Array.isArray(payload.data)
    ) {
      helpers.error(res, "invalid BlueBubbles webhook payload", 400);
      return true;
    }

    try {
      await service.handleWebhook(payload);
      helpers.json(res, { ok: true });
    } catch (error) {
      helpers.error(
        res,
        `failed to handle bluebubbles webhook: ${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    }
    return true;
  }

  return false;
}
