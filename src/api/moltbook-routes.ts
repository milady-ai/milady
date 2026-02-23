import type { AgentRuntime } from "@elizaos/core";
import type {
  MoltbookApiRequestInput,
  MoltbookApiResult,
  MoltbookOnboardInput,
  MoltbookOnboardResult,
  MoltbookStatus,
} from "@elizaos/plugin-moltbook";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

type MoltbookServiceLike = {
  getStatus: () => MoltbookStatus;
  onboardAgent: (input: MoltbookOnboardInput) => Promise<MoltbookOnboardResult>;
  request: (input: MoltbookApiRequestInput) => Promise<MoltbookApiResult>;
};

type OnboardBody = {
  name?: unknown;
  description?: unknown;
  metadata?: unknown;
  saveCredentials?: unknown;
  credentialsPath?: unknown;
};

type RequestBody = {
  method?: unknown;
  path?: unknown;
  query?: unknown;
  body?: unknown;
  requireAuth?: unknown;
};

export interface MoltbookRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error" | "readJsonBody"> {
  runtime: AgentRuntime | null;
}

function toTrimmedString(value: unknown): string | undefined {
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
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return undefined;
}

function getMoltbookService(
  runtime: AgentRuntime | null,
): MoltbookServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("moltbook") as MoltbookServiceLike | null;
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

export async function handleMoltbookRoutes(
  ctx: MoltbookRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, runtime, readJsonBody, json, error } =
    ctx;

  const isStatus = method === "GET" && pathname === "/api/moltbook/status";
  const isOnboard = method === "POST" && pathname === "/api/moltbook/onboard";
  const isRequest = method === "POST" && pathname === "/api/moltbook/request";

  if (!isStatus && !isOnboard && !isRequest) {
    return false;
  }

  const service = getMoltbookService(runtime);
  if (!service) {
    error(
      res,
      "Moltbook service not available. Enable @elizaos/plugin-moltbook.",
      503,
    );
    return true;
  }

  if (isStatus) {
    json(res, { ok: true, status: service.getStatus() });
    return true;
  }

  if (isOnboard) {
    const body = await readJsonBody<OnboardBody>(req, res);
    if (!body) return true;

    const name = toTrimmedString(body.name);
    const description = toTrimmedString(body.description);
    if (!name || !description) {
      error(
        res,
        "Invalid onboarding payload. Provide `name` and `description`.",
        400,
      );
      return true;
    }

    const result = await service.onboardAgent({
      name,
      description,
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? (body.metadata as Record<string, unknown>)
          : undefined,
      saveCredentials: toBooleanOrUndefined(body.saveCredentials),
      credentialsPath: toTrimmedString(body.credentialsPath),
    });
    json(res, { ok: true, result: serializeOnboardResult(result) });
    return true;
  }

  const body = await readJsonBody<RequestBody>(req, res);
  if (!body) return true;

  const requestPath = toTrimmedString(body.path);
  if (!requestPath) {
    error(res, "Invalid request payload. Provide `path`.", 400);
    return true;
  }

  const result = await service.request({
    method: toTrimmedString(body.method),
    path: requestPath,
    query:
      body.query && typeof body.query === "object"
        ? (body.query as Record<string, unknown>)
        : undefined,
    body: body.body,
    requireAuth: toBooleanOrUndefined(body.requireAuth),
  });
  json(res, { ok: result.ok, result }, result.ok ? 200 : 500);
  return true;
}
