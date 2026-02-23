import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  type State,
} from "@elizaos/core";
import type {
  MoltbookApiRequestInput,
  MoltbookApiResult,
  MoltbookService,
} from "../services/moltbook-service.ts";

interface MoltbookRequestOptions extends Record<string, unknown> {
  method?: string;
  path?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  requireAuth?: boolean;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
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

function parseMessageCommand(
  text: string,
): { method: string; path: string } | null {
  const match = text
    .trim()
    .match(/^(?:\/?moltbook)\s+(GET|POST|PATCH|PUT|DELETE)\s+(\S+)$/i);
  if (!match) {
    return null;
  }

  return {
    method: match[1].toUpperCase(),
    path: match[2],
  };
}

export function extractApiRequestInput(
  message: Memory,
  options: MoltbookRequestOptions,
): MoltbookApiRequestInput | null {
  const method = normalizeString(options.method);
  const path = normalizeString(options.path);

  const baseInput: MoltbookApiRequestInput = {
    method,
    path: path ?? "",
    query:
      options.query && typeof options.query === "object"
        ? options.query
        : undefined,
    body: options.body,
    requireAuth: normalizeBoolean(options.requireAuth),
  };

  if (path) {
    return baseInput;
  }

  const text = normalizeString(message.content?.text);
  if (!text) {
    return null;
  }

  const parsed = parseMessageCommand(text);
  if (!parsed) {
    return null;
  }

  return {
    ...baseInput,
    method: parsed.method,
    path: parsed.path,
  };
}

function summarizeResult(result: MoltbookApiResult): string {
  const statusLine = result.ok
    ? `Moltbook request succeeded (${result.status}).`
    : `Moltbook request failed (${result.status}).`;

  const payload = (() => {
    if (typeof result.data === "string") {
      return result.data;
    }
    try {
      return JSON.stringify(result.data, null, 2);
    } catch {
      return String(result.data);
    }
  })();

  if (!payload) {
    return statusLine;
  }

  const preview = payload.slice(0, 2_000);
  const suffix = payload.length > 2_000 ? "\n..." : "";
  return `${statusLine}\n\n${preview}${suffix}`;
}

function serializeResultPayload(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export const moltbookApiRequestAction: Action = {
  name: "MOLTBOOK_API_REQUEST",
  similes: ["MOLTBOOK_REQUEST", "MOLTBOOK_CALL", "MOLTBOOK_HTTP"],
  description:
    "Perform a Moltbook API request via the secure Moltbook service.",

  validate: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
  ): Promise<boolean> => {
    return Boolean(runtime.getService("moltbook"));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService("moltbook") as MoltbookService | null;
    if (!service) {
      const error =
        "Moltbook service is not available. Ensure plugin-moltbook is enabled.";
      if (callback) {
        await callback({ text: error, source: message.content.source });
      }
      return { success: false, error };
    }

    const input = extractApiRequestInput(
      message,
      options as MoltbookRequestOptions,
    );
    if (!input || !input.path) {
      const error =
        "No Moltbook request path provided. Use options.path or message format: `moltbook GET /posts?sort=new`";
      if (callback) {
        await callback({ text: error, source: message.content.source });
      }
      return { success: false, error };
    }

    try {
      const result = await service.request(input);
      const text = summarizeResult(result);

      if (callback) {
        await callback({ text, source: message.content.source });
      }

      return {
        success: result.ok,
        text,
        data: {
          ok: result.ok,
          status: result.status,
          method: result.method,
          path: result.path,
          error: result.error ?? null,
          payload: serializeResultPayload(result.data),
        },
        ...(result.ok
          ? {}
          : { error: result.error ?? "Moltbook request failed" }),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`MOLTBOOK_API_REQUEST failed: ${errorMessage}`);

      if (callback) {
        await callback({ text: errorMessage, source: message.content.source });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "moltbook GET /posts?sort=hot&limit=5",
        },
      },
      {
        name: "{{name2}}",
        content: {
          text: "Moltbook request succeeded (200).",
          actions: ["MOLTBOOK_API_REQUEST"],
        },
      },
    ],
  ],
};
