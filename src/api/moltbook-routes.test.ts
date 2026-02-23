import { describe, expect, test, vi } from "vitest";
import { handleMoltbookRoutes } from "./moltbook-routes";

type RuntimeLike = {
  getService: (name: string) => unknown;
};

function createMoltbookServiceMock() {
  return {
    getStatus: vi.fn(() => ({
      available: true,
      apiBaseUrl: "https://www.moltbook.com/api/v1",
      hasApiKey: true,
      credentialsPath: "/tmp/moltbook/credentials.json",
      timeoutMs: 30_000,
      maxResponseChars: 50_000,
    })),
    onboardAgent: vi.fn(async () => ({
      success: true,
      agentName: "MiladyAgent",
      apiKey: "moltbook_redacted",
      claimUrl: "https://www.moltbook.com/claim/abc",
      verificationCode: "reef-X4B2",
      credentialsSavedPath: "/tmp/moltbook/credentials.json",
      raw: { success: true },
    })),
    request: vi.fn(async () => ({
      ok: true,
      status: 200,
      method: "GET",
      path: "/posts",
      data: { success: true },
    })),
  };
}

async function invoke(args: {
  method: string;
  pathname: string;
  body?: Record<string, unknown> | null;
  runtime?: RuntimeLike | null;
}) {
  let status = 200;
  let payload: unknown = null;

  const handled = await handleMoltbookRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    runtime: (args.runtime ?? null) as never,
    readJsonBody: vi.fn(async () => args.body ?? null),
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return { handled, status, payload };
}

describe("moltbook routes", () => {
  test("returns false for unrelated routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
      runtime: null,
    });

    expect(result.handled).toBe(false);
  });

  test("returns 503 when moltbook service is unavailable", async () => {
    const runtime = {
      getService: () => null,
    };

    const result = await invoke({
      method: "GET",
      pathname: "/api/moltbook/status",
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(503);
    expect(result.payload).toEqual({
      error: "Moltbook service not available. Enable @elizaos/plugin-moltbook.",
    });
  });

  test("handles GET /api/moltbook/status", async () => {
    const service = createMoltbookServiceMock();
    const runtime = {
      getService: () => service,
    };

    const result = await invoke({
      method: "GET",
      pathname: "/api/moltbook/status",
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(service.getStatus).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        available: true,
        apiBaseUrl: "https://www.moltbook.com/api/v1",
      },
    });
  });

  test("validates onboarding payload", async () => {
    const service = createMoltbookServiceMock();
    const runtime = {
      getService: () => service,
    };

    const result = await invoke({
      method: "POST",
      pathname: "/api/moltbook/onboard",
      body: { name: "MiladyAgent" },
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(service.onboardAgent).not.toHaveBeenCalled();
    expect(result.payload).toEqual({
      error: "Invalid onboarding payload. Provide `name` and `description`.",
    });
  });

  test("handles POST /api/moltbook/onboard", async () => {
    const service = createMoltbookServiceMock();
    const runtime = {
      getService: () => service,
    };

    const result = await invoke({
      method: "POST",
      pathname: "/api/moltbook/onboard",
      body: {
        name: "MiladyAgent",
        description: "A test agent",
      },
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(service.onboardAgent).toHaveBeenCalledWith({
      name: "MiladyAgent",
      description: "A test agent",
      metadata: undefined,
      saveCredentials: undefined,
      credentialsPath: undefined,
    });
    expect(result.payload).toEqual({
      ok: true,
      result: {
        success: true,
        agentName: "MiladyAgent",
        hasApiKey: true,
        claimUrl: "https://www.moltbook.com/claim/abc",
        verificationCode: "reef-X4B2",
        credentialsSavedPath: "/tmp/moltbook/credentials.json",
      },
    });
    expect(
      (result.payload as { result: Record<string, unknown> }).result.apiKey,
    ).toBeUndefined();
    expect(
      (result.payload as { result: Record<string, unknown> }).result.raw,
    ).toBeUndefined();
  });

  test("validates request payload", async () => {
    const service = createMoltbookServiceMock();
    const runtime = {
      getService: () => service,
    };

    const result = await invoke({
      method: "POST",
      pathname: "/api/moltbook/request",
      body: { method: "GET" },
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(service.request).not.toHaveBeenCalled();
    expect(result.payload).toEqual({
      error: "Invalid request payload. Provide `path`.",
    });
  });

  test("handles POST /api/moltbook/request and preserves upstream status intent", async () => {
    const service = createMoltbookServiceMock();
    service.request.mockResolvedValueOnce({
      ok: false,
      status: 429,
      method: "POST",
      path: "/posts",
      data: { success: false, error: "rate_limited" },
      error: "rate_limited",
    });

    const runtime = {
      getService: () => service,
    };

    const result = await invoke({
      method: "POST",
      pathname: "/api/moltbook/request",
      body: {
        method: "POST",
        path: "/posts",
        body: { title: "Hello" },
      },
      runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(500);
    expect(service.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/posts",
      query: undefined,
      body: { title: "Hello" },
      requireAuth: undefined,
    });
    expect(result.payload).toMatchObject({
      ok: false,
      result: {
        status: 429,
      },
    });
  });
});
