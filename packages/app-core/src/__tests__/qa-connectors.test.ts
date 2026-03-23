import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MiladyClient } from "../api/client";

describe("QA: Connectors & Triggers", () => {
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

  describe("QA: Connectors", () => {
    it("BTN-CN001: getConnectors returns list", async () => {
      const connectors = {
        "cn-1": { type: "discord", name: "Main Server", status: "active" },
        "cn-2": { type: "telegram", name: "Alerts", status: "active" },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ connectors }),
      });

      const result = await client.getConnectors();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/connectors");
      expect(result.connectors["cn-1"].type).toBe("discord");
      expect(result.connectors["cn-2"].name).toBe("Alerts");
    });

    it("BTN-CN002: saveConnector with discord config succeeds", async () => {
      const discordConfig = {
        type: "discord",
        name: "My Discord Bot",
        token: "discord-bot-token-123",
        guildId: "123456789",
        channelId: "987654321",
      };
      const updatedConnectors = {
        "cn-new": { ...discordConfig, status: "active" },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ connectors: updatedConnectors }),
      });

      const result = await client.saveConnector("cn-new", discordConfig);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/connectors");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.name).toBe("cn-new");
      expect(body.config).toBeDefined();
      expect(result.connectors["cn-new"].type).toBe("discord");
    });

    it("BTN-CN010: deleteConnector removes connector", async () => {
      const remainingConnectors = {
        "cn-2": { type: "telegram", name: "Alerts", status: "active" },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ connectors: remainingConnectors }),
      });

      const result = await client.deleteConnector("cn-1");

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/connectors/cn-1");
      expect(result.connectors["cn-2"].type).toBe("telegram");
    });

    it("Error: saveConnector with invalid token returns validation error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Validation Error",
          message: "Invalid Discord bot token format",
          field: "token",
        }),
      });

      await expect(
        client.saveConnector("cn-bad", {
          type: "discord",
          name: "Bad Bot",
          token: "invalid",
        })
      ).rejects.toThrow();
    });
  });

  describe("QA: Triggers", () => {
    it("BTN-T001: createTrigger with schedule succeeds", async () => {
      const triggerConfig = {
        name: "Hourly Price Check",
        type: "schedule",
        cron: "0 * * * *",
        action: "check-prices",
      };
      const triggerSummary = {
        id: "trg-1",
        ...triggerConfig,
        enabled: true,
        createdAt: "2026-03-22T00:00:00Z",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ trigger: triggerSummary }),
      });

      const result = await client.createTrigger(triggerConfig);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/triggers");
      expect(result.trigger.id).toBe("trg-1");
      expect(result.trigger.cron).toBe("0 * * * *");
      expect(result.trigger.enabled).toBe(true);
    });

    it("BTN-T002: updateTrigger saves changes", async () => {
      const updates = {
        name: "Updated Trigger",
        cron: "*/30 * * * *",
      };
      const triggerSummary = {
        id: "trg-1",
        name: "Updated Trigger",
        cron: "*/30 * * * *",
        type: "schedule",
        enabled: true,
        updatedAt: "2026-03-22T01:00:00Z",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ trigger: triggerSummary }),
      });

      const result = await client.updateTrigger("trg-1", updates);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/triggers/trg-1");
      expect(result.trigger.name).toBe("Updated Trigger");
      expect(result.trigger.cron).toBe("*/30 * * * *");
    });

    it("BTN-T003: deleteTrigger removes trigger", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const result = await client.deleteTrigger("trg-1");

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/triggers/trg-1");
      expect(result.ok).toBe(true);
    });

    it("BTN-T004: runTriggerNow executes trigger immediately", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            status: "completed",
            taskDeleted: false,
          },
          trigger: { id: "trg-1", name: "Hourly Price Check" },
        }),
      });

      const result = await client.runTriggerNow("trg-1");

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toContain("/api/triggers/trg-1/execute");
      expect(result.ok).toBe(true);
      expect(result.result.status).toBe("completed");
      expect(result.result.taskDeleted).toBe(false);
    });
  });
});
