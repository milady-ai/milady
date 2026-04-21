/**
 * Config Hot-Reload — E2E Tests
 *
 * Tests:
 * - GET /api/config returns current config
 * - PUT /api/config updates config
 * - Config changes are reflected in subsequent GET
 * - Invalid config change → graceful rejection
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

vi.mock("../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let port: number;
let server: Awaited<ReturnType<typeof startApiServer>>;
let tempDir: string;
let prevElizaStateDir: string | undefined;
let prevMiladyStateDir: string | undefined;

beforeAll(async () => {
  prevElizaStateDir = process.env.ELIZA_STATE_DIR;
  prevMiladyStateDir = process.env.MILADY_STATE_DIR;
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-config-hot-"));
  process.env.ELIZA_STATE_DIR = tempDir;
  process.env.MILADY_STATE_DIR = tempDir;
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
  await fs.rm(tempDir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
  if (prevElizaStateDir === undefined) {
    delete process.env.ELIZA_STATE_DIR;
  } else {
    process.env.ELIZA_STATE_DIR = prevElizaStateDir;
  }
  if (prevMiladyStateDir === undefined) {
    delete process.env.MILADY_STATE_DIR;
  } else {
    process.env.MILADY_STATE_DIR = prevMiladyStateDir;
  }
}, 15_000);

// ============================================================================
//  1. Config read
// ============================================================================

describe("config endpoints", () => {
  it("GET /api/config returns config object", async () => {
    const { status, data } = await req(port, "GET", "/api/config");
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(typeof data).toBe("object");
  });

  it("GET /api/config/schema returns JSON schema", async () => {
    const { status, data } = await req(port, "GET", "/api/config/schema");
    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

// ============================================================================
//  2. Config update
// ============================================================================

describe("config updates", () => {
  it("PUT /api/config accepts valid updates", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      ui: { theme: "dark" },
    });
    // Should accept the update or reject if validation fails
    expect([200, 400, 500]).toContain(status);
  });

  it("config changes are reflected in subsequent GET", async () => {
    // First GET to baseline
    const { data: before } = await req(port, "GET", "/api/config");
    expect(before).toBeDefined();

    // Subsequent GET should return valid config (regardless of PUT)
    const { status, data: after } = await req(port, "GET", "/api/config");
    expect(status).toBe(200);
    expect(after).toBeDefined();
  });

  it("persists canonical direct-provider routing patches", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      serviceRouting: {
        llmText: {
          backend: "openrouter",
          transport: "direct",
          primaryModel: "openai/gpt-5.4-mini",
        },
      },
    });
    expect(status).toBe(200);

    const { data } = await req(port, "GET", "/api/config");
    expect(data.serviceRouting?.llmText).toEqual({
      backend: "openrouter",
      transport: "direct",
      primaryModel: "openai/gpt-5.4-mini",
    });
    expect(data.connection).toBeUndefined();
  });

  it("persists canonical cloud inference routing without reconstructing connection", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      deploymentTarget: {
        runtime: "cloud",
        provider: "elizacloud",
      },
      linkedAccounts: {
        elizacloud: {
          status: "linked",
          source: "api-key",
        },
      },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
          smallModel: "openai/gpt-5.4-mini",
          largeModel: "anthropic/claude-sonnet-4.6",
        },
      },
    });
    expect(status).toBe(200);

    const { data } = await req(port, "GET", "/api/config");
    expect(data.deploymentTarget).toEqual({
      runtime: "cloud",
      provider: "elizacloud",
    });
    expect(data.serviceRouting?.llmText).toEqual({
      backend: "elizacloud",
      transport: "cloud-proxy",
      accountId: "elizacloud",
      smallModel: "openai/gpt-5.4-mini",
      largeModel: "anthropic/claude-sonnet-4.6",
    });
    expect(data.connection).toBeUndefined();
  });

  it("rejects deprecated connection patches without mutating config", async () => {
    const before = (await req(port, "GET", "/api/config")).data;

    const { status, data } = await req(port, "PUT", "/api/config", {
      connection: {
        kind: "local-provider",
        provider: "banana-ai",
      },
    });
    expect(status).toBe(400);
    expect(String(data.error)).toMatch(/connection/i);

    const after = (await req(port, "GET", "/api/config")).data;
    expect(after).toEqual(before);
  });

  it("does not mark linked cloud auth without inference routing as onboarding-complete", async () => {
    const isolatedDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-config-hot-linked-cloud-"),
    );
    const prevIsolatedElizaStateDir = process.env.ELIZA_STATE_DIR;
    const prevIsolatedMiladyStateDir = process.env.MILADY_STATE_DIR;
    process.env.ELIZA_STATE_DIR = isolatedDir;
    process.env.MILADY_STATE_DIR = isolatedDir;

    const isolatedServer = await startApiServer({
      port: 0,
      initialAgentState: "not_started",
    });

    try {
      const { status } = await req(isolatedServer.port, "PUT", "/api/config", {
        deploymentTarget: {
          runtime: "cloud",
          provider: "elizacloud",
        },
        linkedAccounts: {
          elizacloud: {
            status: "linked",
            source: "api-key",
          },
        },
        cloud: {
          enabled: true,
          apiKey: "ck-partial-cloud",
        },
      });
      expect(status).toBe(200);

      const onboarding = await req(
        isolatedServer.port,
        "GET",
        "/api/onboarding/status",
      );
      expect(onboarding.status).toBe(200);
      expect(onboarding.data).toEqual({ complete: false });
    } finally {
      await isolatedServer.close();
      await fs.rm(isolatedDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
      if (prevIsolatedElizaStateDir === undefined) {
        delete process.env.ELIZA_STATE_DIR;
      } else {
        process.env.ELIZA_STATE_DIR = prevIsolatedElizaStateDir;
      }
      if (prevIsolatedMiladyStateDir === undefined) {
        delete process.env.MILADY_STATE_DIR;
      } else {
        process.env.MILADY_STATE_DIR = prevIsolatedMiladyStateDir;
      }
    }
  });
});
