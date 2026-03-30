import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    // Ignore cleanup failures in tests
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
      // Retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("POST /api/onboarding compat replay", () => {
  const ENV_KEYS_TO_SAVE = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "MILADY_CONFIG_PATH",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_ENABLED",
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

  it("preserves a local provider key and disables stale cloud inference across the compat replay", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-replay-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    const configPath = path.join(tempDir, "eliza.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        logging: { level: "error" },
        cloud: {
          enabled: true,
          provider: "elizacloud",
          apiKey: "stale-cloud-key",
          inferenceMode: "cloud",
          runtime: "cloud",
        },
        models: {
          small: "openai/gpt-5-mini",
          large: "moonshotai/kimi-k2-0905",
        },
      }),
    );

    const server = await startApiServer({ port: 0 });

    try {
      const { status } = await req(server.port, "POST", "/api/onboarding", {
        name: "Chen",
        bio: ["A warm analyst."],
        systemPrompt: "You are Chen.",
        connection: {
          kind: "local-provider",
          provider: "groq",
          apiKey: "gsk-test-groq-key",
        },
      });

      expect(status).toBe(200);

      const config = await waitForConfig(configPath, (candidate) =>
        Boolean(
          (candidate.env as Record<string, string> | undefined)?.GROQ_API_KEY,
        ),
      );
      const env = (config.env ?? {}) as Record<string, string>;
      const cloud = (config.cloud ?? {}) as Record<string, unknown>;
      const models = (config.models ?? {}) as Record<string, unknown>;

      expect(env.GROQ_API_KEY).toBe("gsk-test-groq-key");
      expect(cloud.enabled).toBe(false);
      expect(cloud.runtime).toBe("local");
      expect(cloud.apiKey).toBe("stale-cloud-key");
      expect(cloud.inferenceMode).toBe("byok");
      expect(models.small).toBeUndefined();
      expect(models.large).toBeUndefined();
      expect((config.meta as Record<string, unknown>)?.onboardingComplete).toBe(
        true,
      );
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });

  it("preserves a local primary model across the compat replay", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-replay-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    const configPath = path.join(tempDir, "eliza.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ logging: { level: "error" } }),
    );

    const server = await startApiServer({ port: 0 });

    try {
      const { status } = await req(server.port, "POST", "/api/onboarding", {
        name: "Chen",
        bio: ["A warm analyst."],
        systemPrompt: "You are Chen.",
        connection: {
          kind: "local-provider",
          provider: "openrouter",
          apiKey: "sk-or-test-key",
          primaryModel: "openai/gpt-5-mini",
        },
      });

      expect(status).toBe(200);

      const config = await waitForConfig(
        configPath,
        (candidate) =>
          (
            (candidate.agents as Record<string, unknown> | undefined)
              ?.defaults as Record<string, unknown> | undefined
          )?.model !== undefined,
      );
      const env = (config.env ?? {}) as Record<string, string>;
      const defaults = ((config.agents ?? {}) as Record<string, unknown>)
        .defaults as Record<string, unknown>;
      const model = (defaults?.model ?? {}) as Record<string, unknown>;

      expect(env.OPENROUTER_API_KEY).toBe("sk-or-test-key");
      expect(model.primary).toBe("openai/gpt-5-mini");
    } finally {
      await server.close();
      await cleanupTempDir(tempDir);
    }
  });
});
