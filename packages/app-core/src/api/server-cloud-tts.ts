/**
 * Cloud TTS helpers — ElevenLabs / Eliza Cloud voice synthesis.
 *
 * These functions resolve API keys, base URLs, and handle the cloud TTS
 * preview route.  They are extracted from `server.ts` for maintainability
 * but re-exported from there so existing imports remain valid.
 */
import type http from "node:http";
import { sanitizeSpeechText } from "@miladyai/agent";
import { loadElizaConfig } from "../config/config";
import { getCloudSecret } from "./cloud-secrets";

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

function normalizeSecretEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (
    trimmed === "REDACTED" ||
    trimmed === "[REDACTED]" ||
    /^\*+$/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

const SUPPORTED_CLOUD_TTS_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);

function resolveCloudVoiceName(
  requestedVoice: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const requested =
    typeof requestedVoice === "string"
      ? requestedVoice.trim().toLowerCase()
      : "";
  if (requested && SUPPORTED_CLOUD_TTS_VOICES.has(requested)) {
    return requested;
  }
  const configured = env.ELIZAOS_CLOUD_TTS_VOICE?.trim().toLowerCase();
  if (configured && SUPPORTED_CLOUD_TTS_VOICES.has(configured)) {
    return configured;
  }
  return "nova";
}

function resolveCloudApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const envKey = normalizeSecretEnvValue(env.ELIZAOS_CLOUD_API_KEY);
  if (envKey) {
    return envKey;
  }

  try {
    const config = loadElizaConfig();
    const configKey = normalizeSecretEnvValue(
      typeof config.cloud?.apiKey === "string"
        ? config.cloud.apiKey
        : undefined,
    );
    if (configKey) {
      return configKey;
    }
  } catch {
    // ignore config load errors and continue with secret store fallback
  }

  const sealedKey = normalizeSecretEnvValue(
    getCloudSecret("ELIZAOS_CLOUD_API_KEY"),
  );
  if (sealedKey) {
    return sealedKey;
  }

  return null;
}

async function readRawRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function sendJsonResponse(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendJsonErrorResponse(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  sendJsonResponse(res, status, { error: message });
}

// ---------------------------------------------------------------------------
// Exported Cloud TTS functions
// ---------------------------------------------------------------------------

export function resolveElevenLabsApiKeyForCloudMode(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const directKey = normalizeSecretEnvValue(env.ELEVENLABS_API_KEY);
  if (directKey) {
    return directKey;
  }
  if (env.ELIZAOS_CLOUD_ENABLED !== "true") {
    return null;
  }
  if (env.ELIZA_CLOUD_TTS_DISABLED === "true") {
    return null;
  }
  return normalizeSecretEnvValue(env.ELIZAOS_CLOUD_API_KEY);
}

export function ensureCloudTtsApiKeyAlias(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const directKey = normalizeSecretEnvValue(env.ELEVENLABS_API_KEY);
  if (directKey) {
    return false;
  }
  const cloudBackedKey = resolveElevenLabsApiKeyForCloudMode(env);
  if (!cloudBackedKey) {
    return false;
  }
  env.ELEVENLABS_API_KEY = cloudBackedKey;
  return true;
}

export function resolveCloudTtsBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.ELIZAOS_CLOUD_BASE_URL?.trim();
  const fallback = "https://www.elizacloud.ai/api/v1";
  if (!configured || configured.length === 0) {
    console.warn(
      "[cloud-tts] ELIZAOS_CLOUD_BASE_URL not set; falling back to default cloud TTS endpoint",
    );
  }
  const base = configured && configured.length > 0 ? configured : fallback;

  try {
    const parsed = new URL(base);
    let path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      path = "/api/v1";
    }
    parsed.pathname = path;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export function resolveCloudTtsCandidateUrls(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const base = resolveCloudTtsBaseUrl(env).replace(/\/+$/, "");
  const candidates = new Set<string>();
  const addBase = (baseUrl: string): void => {
    const trimmed = baseUrl.replace(/\/+$/, "");
    candidates.add(`${trimmed}/voice/tts`);
    candidates.add(`${trimmed}/audio/speech`);
  };

  addBase(base);
  try {
    const parsed = new URL(base);
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
      addBase(parsed.toString());
    } else {
      parsed.hostname = `www.${parsed.hostname}`;
      addBase(parsed.toString());
    }
  } catch {
    // no-op
  }

  return [...candidates];
}

export async function handleCloudTtsPreviewRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const cloudApiKey = resolveCloudApiKey();
  if (!cloudApiKey) {
    sendJsonErrorResponse(
      res,
      401,
      "Eliza Cloud is not connected. Connect your Eliza Cloud account first.",
    );
    return true;
  }

  const rawBody = await readRawRequestBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid JSON request body");
    return true;
  }

  const text = sanitizeSpeechText(
    typeof body.text === "string" ? body.text : "",
  );
  if (!text) {
    sendJsonErrorResponse(res, 400, "Missing text");
    return true;
  }

  const cloudModel =
    (typeof body.modelId === "string" && body.modelId.trim()) ||
    process.env.ELIZAOS_CLOUD_TTS_MODEL?.trim() ||
    "gpt-5-mini-tts";
  const cloudVoice = resolveCloudVoiceName(body.voiceId);
  const cloudInstructions = process.env.ELIZAOS_CLOUD_TTS_INSTRUCTIONS?.trim();
  const cloudUrls = resolveCloudTtsCandidateUrls();

  try {
    let lastStatus = 0;
    let lastDetails = "unknown error";
    let cloudResponse: Response | null = null;
    for (const cloudUrl of cloudUrls) {
      const attempt = await fetch(cloudUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cloudApiKey}`,
          "x-api-key": cloudApiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          input: text,
          model: cloudModel,
          modelId: cloudModel,
          voice: cloudVoice,
          voiceId: cloudVoice,
          format: "mp3",
          ...(cloudInstructions ? { instructions: cloudInstructions } : {}),
        }),
      });

      if (attempt.ok) {
        cloudResponse = attempt;
        break;
      }

      lastStatus = attempt.status;
      lastDetails = await attempt.text().catch(() => "unknown error");
    }
    if (!cloudResponse) {
      sendJsonErrorResponse(
        res,
        502,
        `Eliza Cloud TTS failed (${lastStatus || 502}): ${lastDetails}`,
      );
      return true;
    }

    const audioBuffer = Buffer.from(await cloudResponse.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(audioBuffer);
    return true;
  } catch (err) {
    sendJsonErrorResponse(
      res,
      502,
      `Eliza Cloud TTS request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return true;
  }
}

export function mirrorCompatHeaders(
  req: Pick<http.IncomingMessage, "headers">,
): void {
  const HEADER_ALIASES = [
    ["x-milady-token", "x-eliza-token"],
    ["x-milady-export-token", "x-eliza-export-token"],
    ["x-milady-client-id", "x-eliza-client-id"],
    ["x-milady-terminal-token", "x-eliza-terminal-token"],
    ["x-milady-ui-language", "x-eliza-ui-language"],
    ["x-milady-agent-action", "x-eliza-agent-action"],
  ] as const;

  for (const [miladyHeader, elizaHeader] of HEADER_ALIASES) {
    const miladyValue = req.headers[miladyHeader];
    const elizaValue = req.headers[elizaHeader];

    if (miladyValue != null && elizaValue == null) {
      req.headers[elizaHeader] = miladyValue;
    }

    if (elizaValue != null && miladyValue == null) {
      req.headers[miladyHeader] = elizaValue;
    }
  }
}
