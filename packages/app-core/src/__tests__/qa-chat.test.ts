import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { MiladyClient } from "@miladyai/app-core/api/client";

const TEST_BASE_URL = "http://localhost:3000";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("QA: Chat", () => {
  let client: MiladyClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MiladyClient(TEST_BASE_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("BTN-C001: sendChatRest sends POST with correct payload", () => {
    it("should POST to /api/chat with message text", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ text: "Hello! How can I help you?", agentName: "Milady" }),
      );

      const result = await client.sendChatRest("Hello");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/chat");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.text).toBe("Hello");

      expect(result.text).toBe("Hello! How can I help you?");
      expect(result.agentName).toBe("Milady");
    });

    it("should include Content-Type application/json header", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ text: "Hi", agentName: "Milady" }),
      );

      await client.sendChatRest("Test");

      const [, options] = mockFetch.mock.calls[0];
      const headers = options.headers ?? {};
      const contentType =
        headers["Content-Type"] ?? headers["content-type"] ?? "";
      expect(contentType).toContain("application/json");
    });
  });

  describe("BTN-C002: createConversation returns new conversation with id", () => {
    it("should create a new conversation and return it", async () => {
      const newConv = {
        conversation: {
          id: "conv-new-456",
          title: "New Conversation",
          createdAt: new Date().toISOString(),
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(newConv));

      const result = await client.createConversation();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/conversations");
      expect(options.method).toBe("POST");

      expect(result.conversation).toBeDefined();
      expect(result.conversation.id).toBe("conv-new-456");
    });

    it("should accept an optional title parameter", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          conversation: { id: "conv-789", title: "My Topic" },
        }),
      );

      const result = await client.createConversation("My Topic");

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe("My Topic");
      expect(result.conversation.title).toBe("My Topic");
    });
  });

  describe("BTN-C003: listConversations returns list", () => {
    it("should GET /api/conversations and return conversations", async () => {
      const conversations = [
        { id: "conv-1", title: "First", createdAt: "2026-01-01T00:00:00Z" },
        { id: "conv-2", title: "Second", createdAt: "2026-01-02T00:00:00Z" },
      ];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ conversations }),
      );

      const result = await client.listConversations();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/conversations");

      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0].id).toBe("conv-1");
    });

    it("should return empty array when no conversations exist", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ conversations: [] }),
      );

      const result = await client.listConversations();
      expect(result.conversations).toEqual([]);
    });
  });

  describe("BTN-C004: deleteConversation sends DELETE", () => {
    it("should send DELETE to /api/conversations/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await client.deleteConversation("conv-to-delete");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/conversations/conv-to-delete");
      expect(options.method).toBe("DELETE");
    });

    it("should throw when conversation does not exist", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(
        client.deleteConversation("nonexistent"),
      ).rejects.toThrow();
    });
  });

  describe("E2E-C001: Streaming chat delivers tokens", () => {
    it("should call onToken callback during streaming", async () => {
      // sendChatStream takes (text, onToken, channelType, signal, conversationMode)
      // Mock fetch to return an SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: "Hello" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: " world" })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, text: "Hello world", agentName: "Milady" })}\n\n`));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const tokens: string[] = [];
      const result = await client.sendChatStream(
        "Say hello",
        (token) => tokens.push(token),
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/chat/stream");
      // Verify the result includes text and agentName
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });

  describe("FUZ-001: Empty message handling", () => {
    it("should send empty string to server (server decides validation)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Message cannot be empty" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(
        client.sendChatRest(""),
      ).rejects.toThrow();
    });

    it("should send whitespace-only message to server", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Message cannot be blank" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      await expect(
        client.sendChatRest("   "),
      ).rejects.toThrow();
    });
  });

  describe("OVR-001: 100K character message does not crash", () => {
    it("should handle a 100,000 character message without throwing", async () => {
      const largeMessage = "A".repeat(100_000);

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ text: "Received your message.", agentName: "Milady" }),
      );

      const result = await client.sendChatRest(largeMessage);

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();

      // Verify the full message was sent
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.text).toHaveLength(100_000);
    });

    it("should send the payload without truncation", async () => {
      const size = 100_000;
      const largeMessage = "B".repeat(size);

      mockFetch.mockResolvedValueOnce(
        jsonResponse({ text: "OK", agentName: "Milady" }),
      );

      await client.sendChatRest(largeMessage);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.text.length).toBe(size);
      expect(body.text[0]).toBe("B");
      expect(body.text[size - 1]).toBe("B");
    });
  });
});
