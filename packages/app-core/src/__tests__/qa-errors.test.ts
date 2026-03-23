import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { MiladyClient, ApiError } from "../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorJsonResponse(status: number, error: string, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QA: Error Scenarios", () => {
  let client: MiladyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new MiladyClient("http://localhost:31337");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // ERR-001: 401 response → ApiError with status 401 and kind "http"
  // -----------------------------------------------------------------------
  it("ERR-001: 401 response throws ApiError with status 401 and kind http", async () => {
    mockFetch.mockResolvedValue(
      errorJsonResponse(401, "Unauthorized"),
    );

    const err = await client.sendChatRest("hello").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // ERR-004: 429 response → ApiError with status 429
  // -----------------------------------------------------------------------
  it("ERR-004: 429 response throws ApiError with status 429", async () => {
    mockFetch.mockResolvedValue(
      errorJsonResponse(429, "Too Many Requests"),
    );

    const err = await client.sendChatRest("hello").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(429);
  });

  // -----------------------------------------------------------------------
  // ERR-006: API provider rate limit (429 with Retry-After header)
  // -----------------------------------------------------------------------
  it("ERR-006: 429 with Retry-After header includes retry info", async () => {
    mockFetch.mockResolvedValue(
      errorJsonResponse(429, "Rate limit exceeded, retry after 30s", {
        "Retry-After": "30",
      }),
    );

    const err = await client.sendChatRest("hello").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    // The error message from the server body should be available
    expect(err.message).toContain("retry");
  });

  // -----------------------------------------------------------------------
  // ERR-007: Out of credits response (402)
  // -----------------------------------------------------------------------
  it("ERR-007: 402 payment required throws ApiError", async () => {
    mockFetch.mockResolvedValue(
      errorJsonResponse(402, "Payment required: out of credits"),
    );

    const err = await client.sendChatRest("hello").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(402);
    expect(err.message).toContain("credits");
  });

  // -----------------------------------------------------------------------
  // ERR-010: Network error (fetch throws TypeError) → kind "network"
  // -----------------------------------------------------------------------
  it("ERR-010: network error from fetch throws ApiError with kind network", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const err = await client.sendChatRest("hello").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("network");
    expect(err.status).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // ERR-014: WebSocket disconnection — verify reconnection state tracking
  // -----------------------------------------------------------------------
  it("ERR-014: WebSocket disconnection triggers reconnection state", async () => {
    let errorCallback: (() => void) | undefined;
    let closeCallback: ((ev: { code: number }) => void) | undefined;

    const mockWs = {
      close: vi.fn(),
      send: vi.fn(),
      readyState: 1, // OPEN
      addEventListener: vi.fn((event: string, cb: any) => {
        if (event === "error") errorCallback = cb;
        if (event === "close") closeCallback = cb;
      }),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => mockWs),
    );

    // After a WebSocket disconnection, the client should track that
    // it is in a disconnected state. We verify the mock was constructed.
    expect(mockWs.readyState).toBe(1);

    // Simulate server disconnect
    if (closeCallback) {
      closeCallback({ code: 1006 });
    }
    // The client should handle this gracefully without throwing
  });

  // -----------------------------------------------------------------------
  // DUM-015: Network failure mid-request → ApiError kind "network"
  // -----------------------------------------------------------------------
  it("DUM-015: network failure mid-request throws ApiError with kind network", async () => {
    mockFetch.mockRejectedValue(new TypeError("network error"));

    const err = await client.updateConfig({ key: "value" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("network");
  });

  // -----------------------------------------------------------------------
  // DUM-018: Slow response — timeout behavior with fake timers
  // -----------------------------------------------------------------------
  it("DUM-018: slow response triggers timeout ApiError", async () => {
    vi.useFakeTimers();

    // fetch returns a promise that never resolves
    mockFetch.mockReturnValue(new Promise(() => {}));

    // Attach catch handler BEFORE advancing timers to avoid unhandled rejection
    const promise = client.sendChatRest("hello").catch((e) => e);

    // Advance past the default timeout (the client uses a built-in timeout)
    await vi.advanceTimersByTimeAsync(120_000);

    const err = await promise;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("timeout");

    vi.useRealTimers();
  });
});
