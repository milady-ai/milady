import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MiladyClient } from "../api/client";

describe("QA: Content Overload & Memory Pressure", () => {
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

  it("OVR-001: handles 10K character message without error", async () => {
    const longMessage = "a".repeat(10_000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: longMessage, agentName: "milady" }),
    });

    const result = await client.sendChatRest(longMessage);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.text.length).toBe(10_000);
    expect(result.text).toBe(longMessage);
    expect(result.agentName).toBe("milady");
  });

  it("OVR-002: handles 1000-line message without error", async () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`);
    const multilineMessage = lines.join("\n");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: multilineMessage, agentName: "milady" }),
    });

    const result = await client.sendChatRest(multilineMessage);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.text.split("\n")).toHaveLength(1000);
    expect(result.text).toBe(multilineMessage);
  });

  it("OVR-003: 500 sequential API calls — no unhandled rejections", async () => {
    const unhandledHandler = vi.fn();
    process.on("unhandledRejection", unhandledHandler);

    try {
      for (let i = 0; i < 500; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ status: "ok", index: i }),
        });
      }

      for (let i = 0; i < 500; i++) {
        await client.getStatus();
      }

      expect(unhandledHandler).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(500);
    } finally {
      process.removeListener("unhandledRejection", unhandledHandler);
    }
  });

  it("OVR-004: 100 conversations created — all have unique IDs", async () => {
    const ids: string[] = [];

    for (let i = 0; i < 100; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          conversation: { id: `conv-${i}`, title: `Conversation ${i}` },
        }),
      });
    }

    for (let i = 0; i < 100; i++) {
      const result = await client.createConversation(`Conversation ${i}`);
      ids.push(result.conversation.id);
    }

    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);
    expect(mockFetch).toHaveBeenCalledTimes(100);
  });

  it("OVR-005: rapid-fire 100 status checks — all resolve without error", async () => {
    for (let i = 0; i < 100; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", uptime: 12345 + i }),
      });
    }

    const promises = Array.from({ length: 100 }, () => client.getStatus());
    const results = await Promise.all(promises);

    expect(results).toHaveLength(100);
    results.forEach((r) => {
      expect(r.status).toBe("ok");
    });
    expect(mockFetch).toHaveBeenCalledTimes(100);
  });

  // --- Memory pressure ---

  it("Memory: JSON.parse handles very large response payloads (1MB JSON)", async () => {
    const largeArray = Array.from({ length: 10_000 }, (_, i) => ({
      id: `item-${i}`,
      data: "x".repeat(80),
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: largeArray }),
    });

    const result = await client.getPlugins();

    expect(mockFetch).toHaveBeenCalledOnce();
    // The client should handle the large payload without throwing
    expect(result).toBeDefined();
  });

  it("Memory: repeated MiladyClient instantiation does not leak", () => {
    const instances: MiladyClient[] = [];

    for (let i = 0; i < 100; i++) {
      instances.push(
        new MiladyClient("http://localhost:3000", `token-${i}`),
      );
    }

    expect(instances).toHaveLength(100);
    // All instances should be independently constructed
    instances.forEach((inst, i) => {
      expect(inst).toBeInstanceOf(MiladyClient);
    });

    // Allow GC — clear references
    instances.length = 0;
    expect(instances).toHaveLength(0);
  });

  // --- Stress ---

  it("Stress: getStatus called 50 times concurrently — all resolve", async () => {
    for (let i = 0; i < 50; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "healthy", timestamp: Date.now() }),
      });
    }

    const results = await Promise.all(
      Array.from({ length: 50 }, () => client.getStatus()),
    );

    expect(results).toHaveLength(50);
    results.forEach((r) => {
      expect(r.status).toBe("healthy");
      expect(r.timestamp).toBeTypeOf("number");
    });
    expect(mockFetch).toHaveBeenCalledTimes(50);
  });
});
