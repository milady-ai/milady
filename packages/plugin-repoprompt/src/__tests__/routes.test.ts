import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, RouteRequest, RouteResponse } from "@elizaos/core";
import { repoPromptRoutes } from "../routes.ts";
import type { RepoPromptRunResult } from "../services/repoprompt-service.ts";

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
  const route = repoPromptRoutes.find((entry) => entry.path === path);
  if (!route || !route.handler) {
    throw new Error(`Missing route: ${path}`);
  }
  return route;
}

describe("repoPromptRoutes", () => {
  it("declares routes as private (auth-protected)", () => {
    for (const route of repoPromptRoutes) {
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
          cliPath: "rp-cli",
          allowedCommands: ["*"],
        }),
      }),
    } as unknown as IAgentRuntime;

    await statusRoute.handler({} as RouteRequest, recorder.res, runtime);

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({
      ok: true,
      status: { available: true, cliPath: "rp-cli", allowedCommands: ["*"] },
    });
  });

  it("returns 400 when run payload is missing command/args", async () => {
    const runRoute = findRoute("/run");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        run: async () => {
          throw new Error("should not run");
        },
      }),
    } as unknown as IAgentRuntime;

    await runRoute.handler({ body: {} } as RouteRequest, recorder.res, runtime);

    expect(recorder.statusCode()).toBe(400);
    expect(recorder.body()).toEqual({
      ok: false,
      error:
        "Invalid run request. Provide `command` or a non-empty `args` array in request body.",
    });
  });

  it("runs command and returns command result payload", async () => {
    const runRoute = findRoute("/run");
    const recorder = createResponseRecorder();

    const mockResult: RepoPromptRunResult = {
      ok: true,
      command: "context_builder",
      args: ["context_builder", "--response-type", "plan"],
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 10,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    };

    const runtime = {
      getService: () => ({
        run: async () => mockResult,
      }),
    } as unknown as IAgentRuntime;

    await runRoute.handler(
      {
        body: { command: "context_builder", args: ["--response-type", "plan"] },
      } as RouteRequest,
      recorder.res,
      runtime,
    );

    expect(recorder.statusCode()).toBe(200);
    expect(recorder.body()).toEqual({ ok: true, result: mockResult });
  });

  it("returns 500 when service throws", async () => {
    const runRoute = findRoute("/run");
    const recorder = createResponseRecorder();

    const runtime = {
      getService: () => ({
        run: async () => {
          throw new Error("boom");
        },
      }),
    } as unknown as IAgentRuntime;

    await runRoute.handler(
      {
        body: { command: "context_builder" },
      } as RouteRequest,
      recorder.res,
      runtime,
    );

    expect(recorder.statusCode()).toBe(500);
    expect(recorder.body()).toEqual({ ok: false, error: "boom" });
  });
});
