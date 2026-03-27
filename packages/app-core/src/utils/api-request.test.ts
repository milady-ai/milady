import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOT_CONFIG, setBootConfig } from "../config/boot-config";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  resolveCompatApiToken,
} from "./api-request";

describe("api-request", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setBootConfig(DEFAULT_BOOT_CONFIG);
  });

  it("aborts the underlying fetch when the timeout expires", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithTimeout("/api/test");
    const rejection = expect(pending).rejects.toThrow(
      `Request timed out after ${DEFAULT_FETCH_TIMEOUT_MS}ms`,
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS + 1);

    await rejection;
    expect(aborted).toBe(true);
  });

  it("maps upstream aborts to a stable request aborted error", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchWithTimeout("/api/test", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow("Request aborted");
  });

  it("prefers session storage tokens over boot config", () => {
    const storage = new Map<string, string>([
      ["milady_api_token", " session-token "],
    ]);
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
    });
    setBootConfig({
      ...DEFAULT_BOOT_CONFIG,
      apiToken: "boot-token",
      branding: {},
    });

    expect(resolveCompatApiToken()).toBe("session-token");
  });
});
