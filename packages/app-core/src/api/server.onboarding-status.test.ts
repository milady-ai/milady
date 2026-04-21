import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";

/** Best-effort temp dir cleanup — retries once on ENOTEMPTY (file handle race). */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests
  }
}

import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const RUNTIME_STUB = {
  character: { name: "Eliza" },
  plugins: [],
  getService: () => null,
  getRoomsByWorld: async () => [],
  getMemories: async () => [],
  getCache: async () => null,
  setCache: async () => {},
} as unknown as AgentRuntime;

describe("GET /api/onboarding/status", () => {
  /** Env keys that startApiServer / upstream may hydrate into process.env. */
  const ENV_KEYS_TO_SAVE = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "MILADY_CONFIG_PATH",
    "MILADY_API_TOKEN",
    "ELIZA_API_TOKEN",
    "EVM_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
  ] as const;

  const savedEnv = new Map<string, string | undefined>();

  for (const key of ENV_KEYS_TO_SAVE) {
    savedEnv.set(key, process.env[key]);
  }

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("returns incomplete for a fresh skeleton config even when a runtime exists", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        env: {
          EVM_PRIVATE_KEY: "0xabc123",
          SOLANA_PRIVATE_KEY: "solana-test-key",
        },
        plugins: {
          entries: {
            browser: { enabled: true },
            computeruse: { enabled: true },
            vision: { enabled: true },
            "coding-agent": { enabled: true },
          },
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(false);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("requires auth when an API token is configured", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_API_TOKEN = "test-onboarding-token";
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({ logging: { level: "error" } }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const unauth = await req(server.port, "GET", "/api/onboarding/status");
      expect(unauth.status).toBe(401);

      const authed = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
        undefined,
        { Authorization: "Bearer test-onboarding-token" },
      );
      expect(authed.status).toBe(200);
      expect(typeof authed.data.complete).toBe("boolean");
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns incomplete for partial cloud auth state before onboarding is finished", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          apiKey: "eliza_test_partial_cloud_auth",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(false);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns incomplete for linked cloud auth without canonical inference routing", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
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
          apiKey: "eliza_test_partial_cloud_auth",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(false);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns complete when a provider is configured via env-backed config", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        env: {
          OPENAI_API_KEY: "sk-test-openai",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns complete when cloud inference was explicitly configured", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          inferenceMode: "cloud",
          provider: "elizacloud",
          apiKey: "eliza_test_finished_cloud_setup",
        },
        models: {
          small: "openai/gpt-5.4-mini",
          large: "anthropic/claude-sonnet-4.6",
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("returns complete for a legacy agent workspace config in ~/.eliza", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-status-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    await fs.writeFile(
      path.join(tempDir, "eliza.json"),
      JSON.stringify({
        logging: { level: "error" },
        agents: {
          defaults: {
            workspace: path.join(tempDir, "agents", "main"),
            adminEntityId: "legacy-admin-entity",
          },
        },
      }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });

    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
