import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { handleTrajectoryRoute } from "../trajectory-routes";

describe("handleTrajectoryRoute", () => {
  it("returns false for unrelated non-trajectory paths without touching the response", async () => {
    const handled = await handleTrajectoryRoute(
      {} as http.IncomingMessage,
      {} as http.ServerResponse,
      {} as AgentRuntime,
      "/api/chat",
      "GET",
    );

    expect(handled).toBe(false);
  });

  it("returns false for unrecognized trajectory subroutes", async () => {
    const handled = await handleTrajectoryRoute(
      {} as http.IncomingMessage,
      {} as http.ServerResponse,
      {} as AgentRuntime,
      "/api/trajectories/extra/path",
      "GET",
    );

    expect(handled).toBe(false);
  });
});
