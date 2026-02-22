import {
  type IAgentRuntime,
  logger,
  type Route,
  type RouteRequest,
  type RouteResponse,
} from "@elizaos/core";
import type {
  RepoPromptRunInput,
  RepoPromptService,
} from "./services/repoprompt-service.ts";

function getService(runtime: IAgentRuntime): RepoPromptService {
  const service = runtime.getService("repoprompt") as RepoPromptService | null;
  if (!service) {
    throw new Error("RepoPrompt service not available");
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

function toArgs(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.split(/\s+/) : undefined;
  }
  return undefined;
}

function parseRunInput(body: unknown): RepoPromptRunInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const command = toStringOrUndefined(record.command);
  const args = toArgs(record.args);

  if (!command && (!args || args.length === 0)) {
    return null;
  }

  return {
    command,
    args,
    window:
      typeof record.window === "number" || typeof record.window === "string"
        ? record.window
        : undefined,
    tab: toStringOrUndefined(record.tab),
    cwd: toStringOrUndefined(record.cwd),
    stdin: toStringOrUndefined(record.stdin),
  };
}

const statusRoute: Route = {
  name: "repoprompt-status",
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

const runRoute: Route = {
  name: "repoprompt-run",
  public: false,
  path: "/run",
  type: "POST",
  handler: async (
    req: RouteRequest,
    res: RouteResponse,
    runtime: IAgentRuntime,
  ) => {
    try {
      const input = parseRunInput(req.body);
      if (!input) {
        res.status(400).json({
          ok: false,
          error:
            "Invalid run request. Provide `command` or a non-empty `args` array in request body.",
        });
        return;
      }

      const service = getService(runtime);
      const result = await service.run(input);
      res.status(result.ok ? 200 : 500).json({
        ok: result.ok,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`RepoPrompt route error: ${message}`);
      res.status(500).json({ ok: false, error: message });
    }
  },
};

export const repoPromptRoutes: Route[] = [statusRoute, runRoute];
