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
import type { AgentRuntime, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { req } from "../../../test/helpers/http";
import { startApiServer } from "../src/api/server";

type ProviderSwitchConfigSnapshot = {
  connection?: unknown;
  serviceRouting?: {
    llmText?: {
      backend?: string;
      transport?: string;
      primaryModel?: string;
    };
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
};

function expectCanonicalProviderSelection(
  config: ProviderSwitchConfigSnapshot,
  expectedProvider: string,
  primaryModel?: string,
) {
  expect(config.connection).toBeUndefined();
  if (expectedProvider === "elizacloud") {
    expect(config.serviceRouting?.llmText).toMatchObject({
      backend: "elizacloud",
      transport: "cloud-proxy",
    });
    return;
  }

  expect(config.serviceRouting?.llmText).toMatchObject({
    backend: expectedProvider,
    transport: "direct",
    ...(primaryModel ? { primaryModel } : {}),
  });
}

function createRuntimeMock(name: string, model: string): AgentRuntime {
  const agentEventService = {
    subscribe: () => () => {},
    subscribeHeartbeat: () => () => {},
  };

  return {
    agentId: `provider-switch-${name}` as UUID,
    character: {
      name,
      model,
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    plugins: [],
    getService: (serviceType: string) =>
      serviceType === "AGENT_EVENT" ? agentEventService : null,
    getServicesByType: () => [],
    getRoomsByWorld: async () => [],
    getAgent: async () => null,
    emitEvent: async () => {},
    registerSendHandler: () => {},
  } as unknown as AgentRuntime;
}

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
      ["@elizaos/plugin-openai", "openai"],
      ["plugin-anthropic", "anthropic"],
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
      expectCanonicalProviderSelection(configRes.data, expectedProvider);
    });
  });

  describe("selection persistence and capability preservation", () => {
    it("allows selecting a direct provider without providing a fresh apiKey", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "openai",
      });
      expect(status).toBe(200);

      const configRes = await req(port, "GET", "/api/config");
      expectCanonicalProviderSelection(configRes.data, "openai");
    });

    it("persists an explicit primaryModel override for the active provider", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "openrouter",
        primaryModel: "openai/gpt-5.4",
      });
      expect(status).toBe(200);

      const configRes = await req(port, "GET", "/api/config");
      expectCanonicalProviderSelection(
        configRes.data,
        "openrouter",
        "openai/gpt-5.4",
      );
      expect(configRes.data.agents.defaults.model.primary).toBe(
        "openai/gpt-5.4",
      );
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
      expectCanonicalProviderSelection(configRes.data, "mistral");
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

      const configRes = await req(port, "GET", "/api/config");
      expectCanonicalProviderSelection(configRes.data, "anthropic");
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
      expectCanonicalProviderSelection(configRes.data, "elizacloud");
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
      expectCanonicalProviderSelection(configRes.data, "pi-ai");
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

      const configRes = await req(port, "GET", "/api/config");
      expectCanonicalProviderSelection(configRes.data, "pi-ai");
    });

    it("stores canonical selection while keeping provider-specific capability env vars", async () => {
      const { status } = await req(port, "POST", "/api/provider/switch", {
        provider: "mistral",
        apiKey: "mistral-key",
      });
      expect(status).toBe(200);
      expect(process.env.MISTRAL_API_KEY).toBe("mistral-key");

      const configRes = await req(port, "GET", "/api/config");
      expectCanonicalProviderSelection(configRes.data, "mistral");
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

  describe("restart behavior", () => {
    it("reports a real restart and swaps the running runtime when hot restart succeeds", async () => {
      const initialRuntime = createRuntimeMock(
        "ProviderSwitchBeforeRestart",
        "before-restart-model",
      );
      const restartedRuntime = createRuntimeMock(
        "ProviderSwitchAfterRestart",
        "after-restart-model",
      );
      let restartCalls = 0;

      const server = await startApiServer({
        port: 0,
        runtime: initialRuntime,
        onRestart: async () => {
          restartCalls += 1;
          return restartedRuntime;
        },
      });

      try {
        const beforeStatus = await req(server.port, "GET", "/api/status");
        expect(beforeStatus.status).toBe(200);
        expect(beforeStatus.data.state).toBe("running");
        expect(beforeStatus.data.agentName).toBe("ProviderSwitchBeforeRestart");
        const beforeStartedAt = beforeStatus.data.startedAt as number;

        await new Promise((resolve) => setTimeout(resolve, 20));

        const switchResponse = await req(
          server.port,
          "POST",
          "/api/provider/switch",
          {
            provider: "openai",
          },
        );

        expect(switchResponse.status).toBe(200);
        expect(switchResponse.data).toMatchObject({
          success: true,
          provider: "openai",
          restarting: true,
        });
        expect(restartCalls).toBe(1);

        const afterStatus = await req(server.port, "GET", "/api/status");
        expect(afterStatus.status).toBe(200);
        expect(afterStatus.data.state).toBe("running");
        expect(afterStatus.data.agentName).toBe("ProviderSwitchAfterRestart");
        expect(afterStatus.data.model).toBe("after-restart-model");
        expect(afterStatus.data.pendingRestart).toBe(false);
        expect(afterStatus.data.pendingRestartReasons).toEqual([]);
        expect(afterStatus.data.startedAt).toBeGreaterThan(beforeStartedAt);
      } finally {
        await server.close();
      }
    });

    it("falls back to a pending restart when hot restart cannot reinitialize the runtime", async () => {
      const initialRuntime = createRuntimeMock(
        "ProviderSwitchFallbackRuntime",
        "fallback-runtime-model",
      );
      let restartCalls = 0;

      const server = await startApiServer({
        port: 0,
        runtime: initialRuntime,
        onRestart: async () => {
          restartCalls += 1;
          return null;
        },
      });

      try {
        const beforeStatus = await req(server.port, "GET", "/api/status");
        expect(beforeStatus.status).toBe(200);
        expect(beforeStatus.data.state).toBe("running");
        expect(beforeStatus.data.agentName).toBe(
          "ProviderSwitchFallbackRuntime",
        );
        const beforeStartedAt = beforeStatus.data.startedAt;

        const switchResponse = await req(
          server.port,
          "POST",
          "/api/provider/switch",
          {
            provider: "anthropic",
          },
        );

        expect(switchResponse.status).toBe(200);
        expect(switchResponse.data).toMatchObject({
          success: true,
          provider: "anthropic",
          restarting: false,
        });
        expect(restartCalls).toBe(1);

        const afterStatus = await req(server.port, "GET", "/api/status");
        expect(afterStatus.status).toBe(200);
        expect(afterStatus.data.state).toBe("running");
        expect(afterStatus.data.agentName).toBe(
          "ProviderSwitchFallbackRuntime",
        );
        expect(afterStatus.data.model).toBe("fallback-runtime-model");
        expect(afterStatus.data.startedAt).toBe(beforeStartedAt);
        expect(afterStatus.data.pendingRestart).toBe(true);
        expect(afterStatus.data.pendingRestartReasons).toContain(
          "provider switch to anthropic",
        );
      } finally {
        await server.close();
      }
    });
  });
});
