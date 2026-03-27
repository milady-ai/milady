import { DEFAULT_BOOT_CONFIG, getBootConfig } from "../config/boot-config";
import { getElizaApiToken } from "./eliza-globals";

export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

const SESSION_STORAGE_API_TOKEN_KEY = "milady_api_token";

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSessionStorageToken(): string | null {
  const storage = globalThis.sessionStorage;
  if (!storage) {
    return null;
  }
  return readTrimmedString(storage.getItem(SESSION_STORAGE_API_TOKEN_KEY));
}

export function resolveCompatApiToken(): string | null {
  return (
    readSessionStorageToken() ??
    readTrimmedString(getBootConfig().apiToken) ??
    readTrimmedString(DEFAULT_BOOT_CONFIG.apiToken) ??
    readTrimmedString(getElizaApiToken()) ??
    null
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const fetchPromise = fetch(input, init);
  const pending: Promise<Response>[] = [fetchPromise];

  pending.push(
    new Promise<Response>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  );

  if (init?.signal) {
    if (init.signal.aborted) {
      throw new Error("Request aborted");
    }

    pending.push(
      new Promise<Response>((_, reject) => {
        abortListener = () => {
          reject(new Error("Request aborted"));
        };
        init.signal?.addEventListener("abort", abortListener, {
          once: true,
        });
      }),
    );
  }

  try {
    return await Promise.race(pending);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Network request failed");
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (init?.signal && abortListener) {
      init.signal.removeEventListener("abort", abortListener);
    }
  }
}
