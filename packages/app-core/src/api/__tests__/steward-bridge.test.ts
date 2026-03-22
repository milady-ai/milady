import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStewardBridgeStatus,
  signTransactionWithOptionalSteward,
} from "../steward-bridge";
import { startApiServer } from "../server";

const mockSignTransaction = vi.fn();
const mockGetAgent = vi.fn();
const mockListAgents = vi.fn();

vi.mock("@stwd/sdk", () => {
  class StewardApiError extends Error {
    status: number;
    data?: unknown;

    constructor(message: string, status = 0, data?: unknown) {
      super(message);
      this.name = "StewardApiError";
      this.status = status;
      this.data = data;
    }
  }

  class StewardClient {
    constructor(_config: unknown) {}

    signTransaction = mockSignTransaction;
    getAgent = mockGetAgent;
    listAgents = mockListAgents;
  }

  return { StewardApiError, StewardClient };
});

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

const ENV_KEYS = [
  "NODE_ENV",
  "ELIZA_STATE_DIR",
  "MILADY_STATE_DIR",
  "STEWARD_API_URL",
  "STEWARD_API_KEY",
  "STEWARD_TENANT_ID",
  "STEWARD_AGENT_ID",
  "ELIZA_API_TOKEN",
  "MILADY_API_TOKEN",
  "EVM_PRIVATE_KEY",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

async function cleanupTempDir(dir: string | undefined): Promise<void> {
  if (!dir) {
    return;
  }

  await fs.rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function req(
  port: number,
  method: string,
  requestPath: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path: requestPath, method },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            data: JSON.parse(raw) as Record<string, unknown>,
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("steward bridge", () => {
  let tempDir: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-steward-"));
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.NODE_ENV = "test";
    mockListAgents.mockResolvedValue([]);
    mockGetAgent.mockResolvedValue({ id: "agent-1" });
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const original = ORIGINAL_ENV[key];
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
    await cleanupTempDir(tempDir);
  });

  it("initializes the Steward client when STEWARD_API_URL is set", async () => {
    const env = {
      STEWARD_API_URL: "https://steward.example",
      STEWARD_AGENT_ID: "agent-1",
    } as NodeJS.ProcessEnv;

    const status = await getStewardBridgeStatus({ env });

    expect(status).toMatchObject({
      configured: true,
      connected: true,
      available: true,
      baseUrl: "https://steward.example",
      agentId: "agent-1",
    });
    expect(mockGetAgent).toHaveBeenCalledWith("agent-1");
  });

  it("falls back to local signing when Steward is unavailable", async () => {
    const { StewardApiError } = await import("@stwd/sdk");
    mockSignTransaction.mockRejectedValueOnce(
      new StewardApiError("Steward offline", 503),
    );
    const fallback = vi.fn().mockResolvedValue({ hash: "0xlocal-hash" });

    const result = await signTransactionWithOptionalSteward({
      env: {
        STEWARD_API_URL: "https://steward.example",
        STEWARD_AGENT_ID: "agent-1",
      } as NodeJS.ProcessEnv,
      evmAddress: "0x123",
      tx: {
        to: "0x000000000000000000000000000000000000dead",
        value: "0",
        chainId: 56,
      },
      fallback,
    });

    expect(result).toMatchObject({
      mode: "local",
      fallbackUsed: true,
      stewardError: "Steward offline",
      result: { hash: "0xlocal-hash" },
    });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("serves the steward status endpoint", async () => {
    process.env.STEWARD_API_URL = "https://steward.example";
    process.env.STEWARD_AGENT_ID = "agent-1";

    await fs.writeFile(
      path.join(tempDir as string, "eliza.json"),
      JSON.stringify({ logging: { level: "error" } }),
    );

    const server = await startApiServer({ port: 0, runtime: RUNTIME_STUB });
    try {
      const { status, data } = await req(
        server.port,
        "GET",
        "/api/wallet/steward-status",
      );

      expect(status).toBe(200);
      expect(data).toMatchObject({
        configured: true,
        connected: true,
        available: true,
        baseUrl: "https://steward.example",
        agentId: "agent-1",
      });
    } finally {
      await server.close();
    }
  });
});
