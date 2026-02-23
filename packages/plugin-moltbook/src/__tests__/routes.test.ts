import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, RouteRequest, RouteResponse } from "@elizaos/core";
import { moltbookRoutes } from "../routes.ts";

function createResponseRecorder(): {
  res: RouteResponse;
  statusCode: () => number;
  body: () => unknown;
} {
  let code = 200;
  let payload: unknown;

  const res: RouteResponse = {
    status(nextCode: number) {
      code = nextCode;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
    send(data: unknown) {
      payload = data;
      return this;
    },
    end() {
      return this;
    },
  };

  return {
    res,
    statusCode: () => code,
    body: () => payload,
  };
}

function findRoute(path: string) {
  const route = moltbookRoutes.find((entry) => entry.path === path);
  if (!route || !route.handler) {
    throw new Error(`Missing route: ${path}`);
  }
  return route;
}

describe("moltbookRoutes", () => {
  it("declares routes as private (auth-protected)", () => {
    for (const route of moltbookRoutes) {
      expect(route.public).toBe(false);
    }
  });

  it("returns status data from the service", async () => {
    const statusRoute = findRoute("/status");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        getStatus: () => ({
          available: true,
          apiBaseUrl: "https://www.moltbook.com/api/v1",
          hasApiKey: true,
        }),
      }),
    } as unknown as IAgentRuntime;

    await statusRoute.handler({} as RouteRequest, recorder.res, runtime);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({
      ok: true,
      status: {
        available: true,
        apiBaseUrl: "https://www.moltbook.com/api/v1",
        hasApiKey: true,
      },
    });
  });

  it("returns 400 when onboarding payload is invalid", async () => {
    const onboardRoute = findRoute("/onboard");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        onboardAgent: async () => {
          throw new Error("should not run");
        },
      }),
    } as unknown as IAgentRuntime;

    await onboardRoute.handler(
      { body: { name: "only-name" } } as RouteRequest,
      recorder.res,
      runtime,
    );

    expect(recorder.statusCode()).toBe(400);
    expect(recorder.body()).toEqual({
      ok: false,
      error:
        "Invalid onboarding payload. Provide `name` and `description` in request body.",
    });
  });

  it("sanitizes onboard response and omits raw credentials", async () => {
    const onboardRoute = findRoute("/onboard");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        onboardAgent: async () => ({
          success: true,
          agentName: "MiladyAgent",
          apiKey: "moltbook_secret_key_123",
          claimUrl: "https://www.moltbook.com/claim/abc",
          verificationCode: "reef-X4B2",
          credentialsSavedPath: "/tmp/moltbook/credentials.json",
          raw: { success: true },
        }),
      }),
    } as unknown as IAgentRuntime;

    await onboardRoute.handler(
      {
        body: { name: "MiladyAgent", description: "A test agent" },
      } as RouteRequest,
      recorder.res,
      runtime,
    );

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({
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
      (recorder.body() as { result: Record<string, unknown> }).result.apiKey,
    ).toBeUndefined();
    expect(
      (recorder.body() as { result: Record<string, unknown> }).result.raw,
    ).toBeUndefined();
  });

  it("runs request and returns result payload", async () => {
    const requestRoute = findRoute("/request");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        request: async () => ({
          ok: true,
          status: 200,
          method: "GET",
          path: "/posts",
          data: { success: true },
        }),
      }),
    } as unknown as IAgentRuntime;

    await requestRoute.handler(
      { body: { method: "GET", path: "/posts" } } as RouteRequest,
      recorder.res,
      runtime,
    );

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({
      ok: true,
      result: {
        ok: true,
        status: 200,
        method: "GET",
        path: "/posts",
        data: { success: true },
      },
    });
  });
});
