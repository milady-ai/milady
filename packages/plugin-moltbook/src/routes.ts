import {
  type IAgentRuntime,
  logger,
  type Route,
  type RouteRequest,
  type RouteResponse,
} from "@elizaos/core";
import type {
  MoltbookApiRequestInput,
  MoltbookOnboardInput,
  MoltbookOnboardResult,
  MoltbookService,
} from "./services/moltbook-service.ts";

function getService(runtime: IAgentRuntime): MoltbookService {
  const service = runtime.getService("moltbook") as MoltbookService | null;
  if (!service) {
    throw new Error("Moltbook service not available");
  }
  return service;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toBooleanOrUndefined(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return undefined;
}

function parseOnboardBody(body: unknown): MoltbookOnboardInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const name = toStringOrUndefined(record.name);
  const description = toStringOrUndefined(record.description);
  if (!name || !description) {
    return null;
  }

  return {
    name,
    description,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : undefined,
    saveCredentials: toBooleanOrUndefined(record.saveCredentials),
    credentialsPath: toStringOrUndefined(record.credentialsPath),
  };
}

function parseRequestBody(body: unknown): MoltbookApiRequestInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const requestPath = toStringOrUndefined(record.path);
  if (!requestPath) {
    return null;
  }

  return {
    method: toStringOrUndefined(record.method),
    path: requestPath,
    query:
      record.query && typeof record.query === "object"
        ? (record.query as Record<string, unknown>)
        : undefined,
    body: record.body,
    requireAuth: toBooleanOrUndefined(record.requireAuth),
  };
}

function serializeOnboardResult(result: MoltbookOnboardResult): {
  success: boolean;
  agentName: string;
  hasApiKey: boolean;
  claimUrl: string | null;
  verificationCode: string | null;
  credentialsSavedPath: string | null;
} {
  return {
    success: result.success,
    agentName: result.agentName,
    hasApiKey: typeof result.apiKey === "string" && result.apiKey.length > 0,
    claimUrl: result.claimUrl ?? null,
    verificationCode: result.verificationCode ?? null,
    credentialsSavedPath: result.credentialsSavedPath ?? null,
  };
}

const statusRoute: Route = {
  name: "moltbook-status",
  public: false,
  path: "/status",
  type: "GET",
  handler: async (
    _req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => {
    try {
      const service = getService(runtime);
      res.json({ ok: true, status: service.getStatus() });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

const onboardRoute: Route = {
  name: "moltbook-onboard",
  public: false,
  path: "/onboard",
  type: "POST",
  handler: async (
    req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => {
    try {
      const input = parseOnboardBody(req.body);
      if (!input) {
        res.status(400).json({
          ok: false,
          error:
            "Invalid onboarding payload. Provide `name` and `description` in request body.",
        });
        return;
      }

      const service = getService(runtime);
      const result = await service.onboardAgent(input);
      res
        .status(200)
        .json({ ok: true, result: serializeOnboardResult(result) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Moltbook onboard route error: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  },
};

const requestRoute: Route = {
  name: "moltbook-request",
  public: false,
  path: "/request",
  type: "POST",
  handler: async (
    req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => {
    try {
      const input = parseRequestBody(req.body);
      if (!input) {
        res.status(400).json({
          ok: false,
          error:
            "Invalid request payload. Provide at least `path` in request body.",
        });
        return;
      }

      const service = getService(runtime);
      const result = await service.request(input);
      res.status(result.ok ? 200 : 500).json({
        ok: result.ok,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Moltbook request route error: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  },
};

export const moltbookRoutes: Route[] = [
  statusRoute,
  onboardRoute,
  requestRoute,
];
