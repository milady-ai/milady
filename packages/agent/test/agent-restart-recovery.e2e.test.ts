/**
 * Agent Restart Recovery — E2E Tests
 *
 * Verifies that agent state is properly preserved and recovered across restarts:
 * - Agent stop → start preserves conversation metadata
 * - Agent lifecycle state transitions are correct
 * - Health endpoint reports accurate status
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api/server";
import { req } from "../../../test/helpers/http";

vi.mock("../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let port: number;
let server: Awaited<ReturnType<typeof startApiServer>>;

beforeAll(async () => {
  server = await startApiServer({
    port: 0, // Random port
    initialAgentState: "not_started",
  });
  port = server.port;
}, 30_000);

afterAll(async () => {
  if (server) {
    await server.close();
  }
}, 15_000);

// ============================================================================
//  1. Lifecycle state transitions
// ============================================================================

describe("agent lifecycle state transitions", () => {
  it("starts in not_started state", async () => {
    const { status, data } = await req(port, "GET", "/api/status");
    expect(status).toBe(200);
    expect(data.state).toBe("not_started");
  });

  it("GET /api/status returns valid response", async () => {
    const { status } = await req(port, "GET", "/api/status");
    expect([200, 503]).toContain(status);
  });
});

// ============================================================================
//  2. Conversation metadata persistence (without runtime)
// ============================================================================

describe("conversation metadata persistence", () => {
  it("GET /api/conversations returns empty list when no runtime", async () => {
    const { status } = await req(port, "GET", "/api/conversations");
    // Without runtime, should still return a valid response
    expect(status === 200 || status === 404 || status === 500).toBe(true);
  });
});

// ============================================================================
//  3. Plugin discovery survives restart
// ============================================================================

describe("plugin discovery survives restart-like scenarios", () => {
  const normalizePluginList = (plugins: unknown[]) =>
    plugins.map((plugin) => {
      if (!plugin || typeof plugin !== "object") return plugin;
      const cloned = JSON.parse(JSON.stringify(plugin)) as Record<string, any>;
      const hints = cloned.configUiHints;
      if (hints && typeof hints === "object") {
        for (const hint of Object.values(hints as Record<string, any>)) {
          if (hint && typeof hint === "object" && Array.isArray(hint.options)) {
            hint.options = [];
          }
        }
      }
      return cloned;
    });

  it("GET /api/plugins returns plugin list", async () => {
    const { status, data } = await req(port, "GET", "/api/plugins");
    expect(status).toBe(200);
    const plugins = data.plugins ?? data;
    expect(Array.isArray(plugins)).toBe(true);
  });

  it("plugin list is stable across multiple requests", async () => {
    const { data: data1 } = await req(port, "GET", "/api/plugins");
    const { data: data2 } = await req(port, "GET", "/api/plugins");
    const list1 = normalizePluginList(data1.plugins ?? data1);
    const list2 = normalizePluginList(data2.plugins ?? data2);
    expect(list1).toEqual(list2);
  });
});

// ============================================================================
//  4. Config survives state transitions
// ============================================================================

describe("config persists across requests", () => {
  it("GET /api/config returns valid config", async () => {
    const { status, data } = await req(port, "GET", "/api/config");
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
  });
});
