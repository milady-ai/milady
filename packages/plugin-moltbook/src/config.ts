import os from "node:os";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_MOLTBOOK_API_BASE_URL = "https://www.moltbook.com/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_CHARS = 50_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MIN_RESPONSE_CHARS = 500;
const MAX_RESPONSE_CHARS = 500_000;

function resolveTildePath(rawPath: string): string {
  if (rawPath === "~") {
    return os.homedir();
  }
  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  return rawPath;
}

function validateApiBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error("MOLTBOOK_API_BASE_URL is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "MOLTBOOK_API_BASE_URL must be a valid URL (expected https://www.moltbook.com/api/v1)",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error("MOLTBOOK_API_BASE_URL must use https");
  }

  if (url.hostname !== "www.moltbook.com") {
    throw new Error(
      "MOLTBOOK_API_BASE_URL host must be www.moltbook.com to preserve Authorization headers",
    );
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath !== "/api/v1" && !normalizedPath.startsWith("/api/v1/")) {
    throw new Error(
      "MOLTBOOK_API_BASE_URL path must begin with /api/v1 (expected https://www.moltbook.com/api/v1)",
    );
  }

  return `${url.origin}${normalizedPath}`;
}

const optionalTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1))
  .optional();

export const moltbookConfigSchema = z.object({
  MOLTBOOK_API_BASE_URL: z
    .string()
    .default(DEFAULT_MOLTBOOK_API_BASE_URL)
    .transform(validateApiBaseUrl),
  MOLTBOOK_API_KEY: optionalTrimmedString,
  MOLTBOOK_AGENT_NAME: optionalTrimmedString,
  MOLTBOOK_CREDENTIALS_PATH: optionalTrimmedString,
  MOLTBOOK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_TIMEOUT_MS)
    .max(MAX_TIMEOUT_MS)
    .default(DEFAULT_TIMEOUT_MS),
  MOLTBOOK_MAX_RESPONSE_CHARS: z.coerce
    .number()
    .int()
    .min(MIN_RESPONSE_CHARS)
    .max(MAX_RESPONSE_CHARS)
    .default(DEFAULT_MAX_RESPONSE_CHARS),
});

export interface MoltbookConfig {
  apiBaseUrl: string;
  apiKey?: string;
  agentName?: string;
  credentialsPath: string;
  timeoutMs: number;
  maxResponseChars: number;
}

export function loadMoltbookConfig(
  raw: Record<string, string | undefined>,
): MoltbookConfig {
  const parsed = moltbookConfigSchema.parse(raw);

  return {
    apiBaseUrl: parsed.MOLTBOOK_API_BASE_URL,
    apiKey: parsed.MOLTBOOK_API_KEY,
    agentName: parsed.MOLTBOOK_AGENT_NAME,
    credentialsPath: path.resolve(
      resolveTildePath(
        parsed.MOLTBOOK_CREDENTIALS_PATH ??
          path.join("~", ".config", "moltbook", "credentials.json"),
      ),
    ),
    timeoutMs: parsed.MOLTBOOK_TIMEOUT_MS,
    maxResponseChars: parsed.MOLTBOOK_MAX_RESPONSE_CHARS,
  };
}
