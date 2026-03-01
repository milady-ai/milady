/**
 * API Base Injection
 *
 * Resolves and injects window.__MILADY_API_BASE__ (and optionally
 * window.__MILADY_API_TOKEN__) into the renderer via the IPC eval channel.
 */

import { executeJavascript, pushToRenderer } from "./ipc-server";

type ExternalApiBaseEnvKey =
  | "MILADY_API_BASE_URL"
  | "MILADY_API_BASE"
  | "MILADY_ELECTRON_API_BASE"
  | "MILADY_ELECTRON_TEST_API_BASE";

const EXTERNAL_API_BASE_ENV_KEYS: readonly ExternalApiBaseEnvKey[] = [
  "MILADY_ELECTRON_TEST_API_BASE",
  "MILADY_ELECTRON_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_BASE",
];

export interface ExternalApiBaseResolution {
  base: string | null;
  source: ExternalApiBaseEnvKey | null;
  invalidSources: ExternalApiBaseEnvKey[];
}

export function normalizeApiBase(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveExternalApiBase(
  env: Record<string, string | undefined>,
): ExternalApiBaseResolution {
  const invalidSources: ExternalApiBaseEnvKey[] = [];

  for (const key of EXTERNAL_API_BASE_ENV_KEYS) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    const normalized = normalizeApiBase(raw);
    if (normalized) {
      return { base: normalized, source: key, invalidSources };
    }
    invalidSources.push(key);
  }

  return { base: null, source: null, invalidSources };
}

export function injectApiBase(base: string, apiToken?: string): void {
  const baseSnippet = `window.__MILADY_API_BASE__ = ${JSON.stringify(base)};`;
  const tokenSnippet = apiToken?.trim()
    ? `window.__MILADY_API_TOKEN__ = ${JSON.stringify(apiToken.trim())};`
    : "";
  const script = `${baseSnippet}${tokenSnippet}`;
  // eval in the webview via the IPC bridge eval channel
  executeJavascript(script);
}

export function pushSharePayload(payload: unknown): void {
  pushToRenderer("milady:share-target", payload);
}
