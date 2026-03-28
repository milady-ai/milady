import type { Action, HandlerOptions } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goLiveAction, goOfflineAction } from "./stream-control";

function jsonResponse(data: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  };
}

async function callAction(
  action: Action,
  params: Record<string, unknown> = {},
) {
  return action.handler({} as never, {} as never, undefined, {
    parameters: params,
  } as HandlerOptions) as Promise<{ text: string; success: boolean }>;
}

describe("stream control actions", () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("starts the stream via POST /api/stream/live", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ live: true }));

    const result = await callAction(goLiveAction);

    expect(result.success).toBe(true);
    expect(result.text).toContain("now live");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/stream/live",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces API errors when going live fails", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: "stream manager unavailable" },
        { ok: false, status: 503 },
      ),
    );

    const result = await callAction(goLiveAction);

    expect(result.success).toBe(false);
    expect(result.text).toContain("stream manager unavailable");
  });

  it("stops the stream via POST /api/stream/offline", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await callAction(goOfflineAction);

    expect(result.success).toBe(true);
    expect(result.text).toContain("Now offline");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:2138/api/stream/offline",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles thrown errors when going offline fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom"));

    const result = await callAction(goOfflineAction);

    expect(result.success).toBe(false);
    expect(result.text).toContain("boom");
  });
});
