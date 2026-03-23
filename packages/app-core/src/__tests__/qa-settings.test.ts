import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MiladyClient } from "../api/client";

describe("QA: Settings & Agent Lifecycle", () => {
  let client: MiladyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new MiladyClient("http://localhost:3000", "test-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("QA: Agent Lifecycle", () => {
    it("BTN-AG001: startAgent returns running state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: {
            state: "running",
            startedAt: "2026-03-22T12:00:00Z",
            pid: 12345,
          },
        }),
      });

      const result = await client.startAgent();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/agent/start");
      expect(result.state).toBe("running");
      expect(result.pid).toBeTypeOf("number");
    });

    it("BTN-AG002: stopAgent returns stopped state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: {
            state: "stopped",
            stoppedAt: "2026-03-22T12:05:00Z",
          },
        }),
      });

      const result = await client.stopAgent();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/agent/stop");
      expect(result.state).toBe("stopped");
    });

    it("BTN-AG003: restartAgent comes back in running state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: {
            state: "running",
            restartedAt: "2026-03-22T12:10:00Z",
            uptime: 0,
          },
        }),
      });

      const result = await client.restartAgent();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/agent/restart");
      expect(result.state).toBe("running");
    });

    it("BTN-AG005: resetAgent clears state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(client.resetAgent()).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/agent/reset");
    });
  });

  describe("QA: Settings & Provider", () => {
    it("BTN-SET005: switchProvider changes provider", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          provider: "anthropic",
          restarting: false,
        }),
      });

      const result = await client.switchProvider("anthropic");

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
      expect(result.provider).toBe("anthropic");
      expect(result.restarting).toBe(false);
    });

    it("Config update with valid data succeeds", async () => {
      const configUpdate = {
        agentName: "milady-prod",
        maxTokens: 4096,
        temperature: 0.7,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...configUpdate,
          updatedAt: "2026-03-22T12:00:00Z",
        }),
      });

      const result = await client.updateConfig(configUpdate);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/config");
      expect(result.agentName).toBe("milady-prod");
      expect(result.maxTokens).toBe(4096);
    });

    it("Config update with blocked env key rejects", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Validation Error",
          message: "Cannot set reserved environment key: NODE_ENV",
          field: "NODE_ENV",
        }),
      });

      await expect(
        client.updateConfig({ NODE_ENV: "production" })
      ).rejects.toThrow();
    });

    it("updateConfig validates schema", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          error: "Schema Validation Error",
          message: "Invalid config: 'maxTokens' must be a positive integer",
          violations: [
            { field: "maxTokens", rule: "positiveInteger", value: -1 },
          ],
        }),
      });

      await expect(
        client.updateConfig({ maxTokens: -1 })
      ).rejects.toThrow();
    });
  });

  describe("QA: Secrets", () => {
    it("BTN-SET004: updateSecrets saves API keys", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          updated: ["OPENAI_API_KEY", "DISCORD_TOKEN"],
        }),
      });

      const result = await client.updateSecrets({
        OPENAI_API_KEY: "sk-new-key-value",
        DISCORD_TOKEN: "new-discord-token",
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/secrets");
      expect(result.ok).toBe(true);
      expect(result.updated).toContain("OPENAI_API_KEY");
    });

    it("getSecrets returns masked values", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          secrets: [
            { key: "OPENAI_API_KEY", value: "sk-****abc1", setAt: "2026-03-20T00:00:00Z" },
            { key: "DISCORD_TOKEN", value: "****xyz9", setAt: "2026-03-21T00:00:00Z" },
          ],
        }),
      });

      const result = await client.getSecrets();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/secrets");
      expect(result.secrets).toHaveLength(2);
      expect(result.secrets[0].value).toContain("****");
      expect(result.secrets[0].value).not.toBe("sk-new-key-value");
    });
  });
});
