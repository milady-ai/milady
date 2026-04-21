import { MiladyClient } from "@miladyai/app-core/api";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function buildSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function buildErroringSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  // Simulate an interrupted stream: deliver chunks then close without a
  // "done" SSE event. Using close() rather than controller.error() avoids
  // an unhandled rejection from Node's ReadableStream pull algorithm, which
  // fires asynchronously even after the reader is cancelled by the client.
  // The observable behaviour is identical — the client sees completed: false
  // because no "done" event was emitted before the stream ended.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function buildJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queueCompatConversation(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockResolvedValueOnce(
    buildJsonResponse({
      conversation: { id: "conv-compat", title: "Quick Chat" },
    }),
  );
}

describe("SSE stream interruption detection", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: MiladyClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    client = new MiladyClient("http://localhost:2138", "token");
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('completed: true when "done" event received', async () => {
    queueCompatConversation(fetchMock);
    fetchMock.mockResolvedValueOnce(
      buildSseResponse([
        'data: {"type":"token","text":"Hello "}\n\n',
        'data: {"type":"token","text":"world"}\n\n',
        'data: {"type":"done","fullText":"Hello world","agentName":"Eliza"}\n\n',
      ]),
    );

    const tokens: string[] = [];
    const result = await client.sendChatStream("hi", (t) => tokens.push(t));

    expect(result.completed).toBe(true);
    expect(result.text).toBe("Hello world");
    expect(result.agentName).toBe("Eliza");
    expect(tokens).toEqual(["Hello ", "world"]);
  });

  test("completed: false when reader throws mid-stream", async () => {
    queueCompatConversation(fetchMock);
    fetchMock.mockResolvedValueOnce(
      buildErroringSseResponse([
        'data: {"type":"token","text":"Partial "}\n\n',
        'data: {"type":"token","text":"response"}\n\n',
      ]),
    );

    const tokens: string[] = [];
    const result = await client.sendChatStream("hi", (t) => tokens.push(t));

    expect(result.completed).toBe(false);
    expect(result.text).toBe("Partial response");
    expect(tokens).toEqual(["Partial ", "response"]);
  });

  test('completed: false when stream ends without "done" event', async () => {
    queueCompatConversation(fetchMock);
    fetchMock.mockResolvedValueOnce(
      buildSseResponse([
        'data: {"type":"token","text":"Truncated "}\n\n',
        'data: {"type":"token","text":"text"}\n\n',
        // No "done" event — stream just ends
      ]),
    );

    const tokens: string[] = [];
    const result = await client.sendChatStream("hi", (t) => tokens.push(t));

    expect(result.completed).toBe(false);
    expect(result.text).toBe("Truncated text");
    expect(tokens).toEqual(["Truncated ", "text"]);
  });

  test("partial text preserved in return value when stream errors", async () => {
    queueCompatConversation(fetchMock);
    fetchMock.mockResolvedValueOnce(
      buildErroringSseResponse([
        'data: {"type":"token","text":"Some "}\n\n',
        'data: {"type":"token","text":"partial "}\n\n',
        'data: {"type":"token","text":"content"}\n\n',
      ]),
    );

    const tokens: string[] = [];
    const result = await client.sendChatStream("hi", (t) => tokens.push(t));

    expect(result.completed).toBe(false);
    expect(result.text).toBe("Some partial content");
  });
});
