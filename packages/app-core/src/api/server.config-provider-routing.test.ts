import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests.
  }
}

async function waitForConfig(
  configPath: string,
  predicate: (config: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (predicate(parsed)) {
        return parsed;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return JSON.parse(await fs.readFile(configPath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("PUT /api/config canonical provider routing", () => {
  const ENV_KEYS_TO_SAVE = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "ELIZA_API_TOKEN",
  ] as const;
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS_TO_SAVE) {
      savedEnv.set(key, process.env[key]);
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("reprojects a stale persisted connection from canonical service routing", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-config-provider-routing-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_API_TOKEN = "test-config-provider-routing";
    const configPath = path.join(tempDir, "eliza.json");

    await fs.writeFile(
      configPath,
      JSON.stringify({
        logging: { level: "error" },
        connection: {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          smallModel: "openai/gpt-5.4-mini",
          largeModel: "moonshotai/kimi-k2-0905",
        },
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
            largeModel: "moonshotai/kimi-k2-0905",
          },
        },
      }),
    );

    const server = await startApiServer({ port: 0 });

    try {
      const { status } = await req(
        server.port,
        "PUT",
        "/api/config",
        {
          deploymentTarget: {
            runtime: "cloud",
            provider: "elizacloud",
          },
          serviceRouting: {
            llmText: {
              backend: "openrouter",
              transport: "direct",
              primaryModel: "openai/gpt-5.4-mini",
            },
          },
        },
        {
          Authorization: "Bearer test-config-provider-routing",
        },
      );

      expect(status).toBe(200);

      const config = await waitForConfig(
        configPath,
        (candidate) =>
          (
            ((candidate.serviceRouting ?? {}) as Record<string, unknown>)
              ?.llmText as Record<string, unknown> | undefined
          )?.backend === "openrouter",
      );

      expect(config.deploymentTarget).toEqual({
        runtime: "cloud",
        provider: "elizacloud",
      });
      expect(
        (config.serviceRouting as Record<string, unknown>)?.llmText,
      ).toEqual({
        backend: "openrouter",
        transport: "direct",
        primaryModel: "openai/gpt-5.4-mini",
      });
      expect(config.connection).toBeUndefined();
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("rejects deprecated connection patches and requires canonical runtime fields", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-config-provider-routing-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    process.env.ELIZA_API_TOKEN = "test-config-provider-routing";
    const configPath = path.join(tempDir, "eliza.json");

    await fs.writeFile(
      configPath,
      JSON.stringify({
        logging: { level: "error" },
      }),
    );

    const server = await startApiServer({ port: 0 });

    try {
      const { status } = await req(
        server.port,
        "PUT",
        "/api/config",
        {
          connection: {
            kind: "cloud-managed",
            cloudProvider: "elizacloud",
            smallModel: "openai/gpt-5.4-mini",
            largeModel: "moonshotai/kimi-k2-0905",
          },
          deploymentTarget: {
            runtime: "cloud",
            provider: "elizacloud",
          },
          serviceRouting: {
            llmText: {
              backend: "openrouter",
              transport: "direct",
              primaryModel: "openai/gpt-5.4-mini",
            },
          },
        },
        {
          Authorization: "Bearer test-config-provider-routing",
        },
      );

      expect(status).toBe(400);

      const config = await waitForConfig(configPath, () => true);
      expect(config.deploymentTarget).toBeUndefined();
      expect(config.serviceRouting).toBeUndefined();
      expect(config.connection).toBeUndefined();
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
