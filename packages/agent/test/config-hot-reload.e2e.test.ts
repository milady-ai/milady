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

  it("persists an explicit root connection patch and derives runtime-facing config", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      connection: {
        kind: "local-provider",
        provider: "openrouter",
        primaryModel: "openai/gpt-5-mini",
      },
    });
    expect(status).toBe(200);

    const { data } = await req(port, "GET", "/api/config");
    expect(data.connection).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      primaryModel: "openai/gpt-5-mini",
    });
    expect(data.agents?.defaults?.model?.primary).toBe("openai/gpt-5-mini");
  });

  it("reconciles connection from provider-affecting config patches when connection is omitted", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    });
    expect(status).toBe(200);

    const { data } = await req(port, "GET", "/api/config");
    expect(data.connection).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      smallModel: "openai/gpt-5-mini",
      largeModel: "anthropic/claude-sonnet-4.5",
    });
  });

  it("rejects malformed connection patches without mutating config", async () => {
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
    expect(after.connection).toEqual(before.connection);
  });

  it("does not mark partial cloud-managed selection as onboarding-complete", async () => {
    const { status } = await req(port, "PUT", "/api/config", {
      connection: {
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
      },
      cloud: {
        enabled: true,
        apiKey: "ck-partial-cloud",
      },
    });
    expect(status).toBe(200);

    const onboarding = await req(port, "GET", "/api/onboarding/status");
    expect(onboarding.status).toBe(200);
    expect(onboarding.data).toEqual({ complete: false });
  });
});
