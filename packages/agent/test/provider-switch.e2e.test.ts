/**
 * E2E tests for POST /api/provider/switch
 *
 * Tests the real API server with persisted config state and canonical provider
 * normalization. The endpoint now changes active selection intent without
 * deleting other configured capabilities.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

describe("POST /api/provider/switch", () => {
  let port: number;
  let close: () => Promise<void>;
  let tempDir: string;
  const savedEnv = new Map<string, string | undefined>();
  const managedEnvKeys = [
    "ELIZA_STATE_DIR",
    "MILADY_STATE_DIR",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "MISTRAL_API_KEY",
    "TOGETHER_API_KEY",
    "ZAI_API_KEY",
    "OLLAMA_BASE_URL",
    "ELIZA_USE_PI_AI",
    "MILADY_USE_PI_AI",
    "ELIZAOS_CLOUD_ENABLED",
    "ELIZAOS_CLOUD_API_KEY",
  ] as const;

  beforeAll(async () => {
    for (const key of managedEnvKeys) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }

    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-provider-switch-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    await fs.rm(tempDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    for (const key of managedEnvKeys) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  describe("input validation", () => {
    it("rejects missing body (no JSON)", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch");
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing provider field", async () => {
      const { status, data } = await req(port, "POST", "/api/provider/switch", {
        apiKey: "sk-test-123",
      });
      expect(status).toBe(400);
      expect(data.error).toMatch(/missing provider/i);
    });

    it("rejects unknown provider", async () => {
      const { status, data } = await req(port, "POST", "/api/provider/switch", {
        provider: "banana-ai",
      });
      expect(status).toBe(400);
      expect(data.error).toMatch(/invalid provider/i);
    });

    it("rejects api keys longer than 512 characters", async () => {
      const { status, data } = await req(port, "POST", "/api/provider/switch", {
        provider: "openai",
        apiKey: "x".repeat(513),
      });
      expect(status).toBe(400);
      expect(data.error).toMatch(/too long/i);
    });
  });

  describe("canonical provider normalization", () => {
    it.each([
      ["google", "gemini"],
      ["google-genai", "gemini"],
      ["xai", "grok"],
      ["openai-subscription", "openai-subscription"],
      ["openai-codex", "openai-subscription"],
      ["ollama", "ollama"],
      ["mistral", "mistral"],
      ["together", "together"],
      ["zai", "zai"],
    ])("normalizes %s to %s", async (inputProvider, expectedProvider) => {
      const { status, data } = await req(port, "POST", "/api/provider/switch", {
        provider: inputProvider,
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe(expectedProvider);

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.status).toBe(200);
      expect(configRes.data.connection).toMatchObject({
        kind:
          expectedProvider === "elizacloud"
            ? "cloud-managed"
            : "local-provider",
      });
      if (expectedProvider === "elizacloud") {
        expect(configRes.data.connection.cloudProvider).toBe("elizacloud");
      } else {
        expect(configRes.data.connection.provider).toBe(expectedProvider);
      }
    });
  });

  describe("selection persistence and capability preservation", () => {
    it("allows selecting a direct provider without providing a fresh apiKey", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "openai",
      });
      expect(status).toBe(200);

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.data.connection).toEqual({
        kind: "local-provider",
        provider: "openai",
      });
    });

    it("preserves existing direct provider credentials when switching to another local provider", async () => {
      await req(port, "POST", "/api/provider/switch", {
        provider: "together",
        apiKey: "sk-together-preserve",
      });
      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-preserve");

      const second = await req(port, "POST", "/api/provider/switch", {
        provider: "mistral",
        apiKey: "sk-mistral-new-key",
      });
      expect(second.status).toBe(200);
      expect(process.env.MISTRAL_API_KEY).toBe("sk-mistral-new-key");
      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-preserve");

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.data.connection).toEqual({
        kind: "local-provider",
        provider: "mistral",
      });
    });

    it("preserves OpenAI credentials when switching to Anthropic", async () => {
      await req(port, "POST", "/api/provider/switch", {
        provider: "openai",
        apiKey: "sk-openai-preserve",
      });
      expect(process.env.OPENAI_API_KEY).toBe("sk-openai-preserve");

      const second = await req(port, "POST", "/api/provider/switch", {
        provider: "anthropic",
        apiKey: "sk-ant-new-key",
      });
      expect(second.status).toBe(200);
      expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-new-key");
      expect(process.env.OPENAI_API_KEY).toBe("sk-openai-preserve");
    });

    it("preserves direct provider credentials when switching to elizacloud", async () => {
      await req(port, "POST", "/api/provider/switch", {
        provider: "together",
        apiKey: "sk-together-cloud-preserve",
      });
      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-cloud-preserve");

      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "elizacloud",
      });
      expect(status).toBe(200);
      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-cloud-preserve");
      expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.data.connection).toEqual({
        kind: "cloud-managed",
        cloudProvider: "elizacloud",
      });
    });

    it("preserves direct provider credentials when switching to pi-ai", async () => {
      await req(port, "POST", "/api/provider/switch", {
        provider: "together",
        apiKey: "sk-together-pi-preserve",
      });
      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-pi-preserve");

      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "pi-ai",
      });
      expect(status).toBe(200);

      expect(process.env.TOGETHER_API_KEY).toBe("sk-together-pi-preserve");
      expect(process.env.ELIZA_USE_PI_AI).toBe("1");

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.data.connection).toEqual({
        kind: "local-provider",
        provider: "pi-ai",
      });
    });

    it("preserves OpenAI credentials when switching to pi-ai", async () => {
      await req(port, "POST", "/api/provider/switch", {
        provider: "openai",
        apiKey: "sk-openai-pi-preserve",
      });
      expect(process.env.OPENAI_API_KEY).toBe("sk-openai-pi-preserve");

      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "pi-ai",
      });
      expect(status).toBe(200);
      expect(process.env.OPENAI_API_KEY).toBe("sk-openai-pi-preserve");
      expect(process.env.ELIZA_USE_PI_AI).toBe("1");
    });

    it("stores canonical selection while keeping provider-specific capability env vars", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "mistral",
        apiKey: "mistral-key",
      });
      expect(status).toBe(200);
      expect(process.env.MISTRAL_API_KEY).toBe("mistral-key");

      const configRes = await req(port, "GET", "/api/config");
      expect(configRes.data.connection).toEqual({
        kind: "local-provider",
        provider: "mistral",
      });
    });
  });

  describe("race condition guard", () => {
    it("rejects concurrent switch requests with 409", async () => {
      const slowServer = await startApiServer({
        port: 0,
        onRestart: () =>
          new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
      });

      try {
        const first = req(slowServer.port, "POST", "/api/provider/switch", {
          provider: "elizacloud",
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        const second = await req(
          slowServer.port,
          "POST",
          "/api/provider/switch",
          { provider: "elizacloud" },
        );

        const firstResult = await first;
        expect(firstResult.status).toBe(200);
        expect(second.status).toBe(409);
        expect(second.data.error).toMatch(/already in progress/i);
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await slowServer.close();
      }
    }, 10_000);
  });
});
