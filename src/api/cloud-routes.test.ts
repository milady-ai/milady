import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudRouteState } from "./cloud-routes.js";
import { handleCloudRoute } from "./cloud-routes.js";

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function timeoutError(message = "The operation was aborted due to timeout") {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

function createReq(url = "/"): http.IncomingMessage {
  return {
    url,
    headers: { host: "localhost:2138" },
  } as unknown as http.IncomingMessage;
}

function createRes(): {
  res: http.ServerResponse;
  getJson: () => Record<string, unknown>;
} {
  let raw = "";
  const headers: Record<string, string> = {};
  const target = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    end: (chunk?: string) => {
      if (typeof chunk === "string") raw += chunk;
    },
  } as unknown as http.ServerResponse;

  return {
    res: target,
    getJson: () => JSON.parse(raw) as Record<string, unknown>,
  };
}

function cloudState(): CloudRouteState {
  return {
    config: { cloud: { baseUrl: "https://test.elizacloud.ai" } },
    cloudManager: null,
    runtime: null,
  } as unknown as CloudRouteState;
}

describe("handleCloudRoute timeout behavior", () => {
  it("returns 504 when cloud login session creation times out", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(async (_input, init) => {
      capturedSignal = init?.signal;
      throw timeoutError();
    });

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login"),
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson().error).toBe("Eliza Cloud login request timed out");
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("returns 504 when cloud login status polling times out", async () => {
    fetchMock.mockRejectedValue(timeoutError());

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login/status?sessionId=test-session"),
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson()).toEqual({
      status: "error",
      error: "Eliza Cloud status request timed out",
    });
  });

  it("returns 502 when cloud polling fails for non-timeout network errors", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login/status?sessionId=test-session"),
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(502);
    expect(getJson()).toEqual({
      status: "error",
      error: "Failed to reach Eliza Cloud",
    });
  });
});
