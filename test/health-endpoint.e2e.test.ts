/**
 * Health Endpoint — E2E Tests
 *
 * Tests the GET /api/health endpoint added for system observability.
 */

import { startApiServer } from "@miladyai/app-core/src/api/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "./helpers/http";

vi.mock("@miladyai/app-core/src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

let port: number;
let server: Awaited<ReturnType<typeof startApiServer>>;

beforeAll(async () => {
  server = await startApiServer({
    port: 0,
    initialAgentState: "not_started",
  });
  port = server.port;
}, 30_000);

afterAll(async () => {
  if (server) {
    await server.close();
  }
}, 15_000);

describe("GET /api/dev/stack", () => {
  it("returns schema, live listen port, and desktop fields from env", async () => {
    const { status, data } = await req(port, "GET", "/api/dev/stack");
    expect(status).toBe(200);
    expect(data.schema).toBe("milady.dev.stack/v1");
    expect(data.api).toEqual({
      listenPort: port,
      baseUrl: `http://127.0.0.1:${port}`,
    });
    expect(data.desktop).toMatchObject({
      rendererUrl: null,
      uiPort: null,
      desktopApiBase: null,
    });
    expect(data.cursorScreenshot).toEqual({
      available: false,
      path: null,
    });
    expect(data.desktopDevLog).toEqual({
      filePath: null,
      apiTailPath: null,
    });
    expect(Array.isArray(data.hints)).toBe(true);
  });
});

describe("GET /api/dev/console-log", () => {
  it("returns 404 when log path env is not set", async () => {
    const { status, data } = await req(port, "GET", "/api/dev/console-log");
    expect(status).toBe(404);
    expect(data).toMatchObject({ error: expect.any(String) });
  });
});

describe("GET /api/dev/cursor-screenshot", () => {
  it("returns 404 when Electrobun screenshot upstream is not configured", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/dev/cursor-screenshot",
    );
    expect(status).toBe(404);
    expect(data).toMatchObject({ error: expect.any(String) });
  });
});

describe("GET /api/health", () => {
  it("returns structured status", async () => {
    const { status, data } = await req(port, "GET", "/api/health");
    expect(status).toBe(200);
    expect(data).toHaveProperty("runtime");
    expect(data).toHaveProperty("database");
    expect(data).toHaveProperty("plugins");
    expect(data).toHaveProperty("coordinator");
    expect(data).toHaveProperty("connectors");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("agentState");
  });

  it("reports runtime not_initialized when no runtime", async () => {
    const { data } = await req(port, "GET", "/api/health");
    expect(data.runtime).toBe("not_initialized");
    expect(data.coordinator).toBe("not_wired");
  });

  it("reports plugins count", async () => {
    const { data } = await req(port, "GET", "/api/health");
    const plugins = data.plugins as Record<string, number>;
    expect(typeof plugins.loaded).toBe("number");
    expect(typeof plugins.failed).toBe("number");
  });

  it("reports agentState=starting while the agent is still starting", async () => {
    const startingServer = await startApiServer({
      port: 0,
      initialAgentState: "starting",
    });

    try {
      const { status, data } = await req(
        startingServer.port,
        "GET",
        "/api/health",
      );
      expect(status).toBe(200);
      expect(data.agentState).toBe("starting");
    } finally {
      await startingServer.close();
    }
  });
});
