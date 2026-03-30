import { MiladyClient } from "@miladyai/app-core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("createConversation greeting wire format", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      writable: true,
      configurable: true,
    });
  });

  it("sends includeGreeting in the request body to match server expectation", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            conversation: {
              id: "conv-1",
              title: "New Chat",
              roomId: "room-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            greeting: {
              text: "hey",
              agentName: "Milady",
              generated: true,
              persisted: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    await client.createConversation(undefined, {
      includeGreeting: true,
      lang: "en",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    // Server expects "includeGreeting" in the wire format
    expect(body.includeGreeting).toBe(true);
    expect(body.lang).toBe("en");
  });

  it("maps bootstrapGreeting to the includeGreeting wire flag", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            conversation: {
              id: "conv-boot",
              title: "New Chat",
              roomId: "room-boot",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    await client.createConversation(undefined, {
      bootstrapGreeting: true,
      lang: "en",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.includeGreeting).toBe(true);
    expect(body.lang).toBe("en");
  });

  it("omits greeting flag when option is not set", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            conversation: {
              id: "conv-2",
              title: "New Chat",
              roomId: "room-2",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    await client.createConversation("My Chat");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.includeGreeting).toBeUndefined();
    expect(body.title).toBe("My Chat");
  });

  it("normalizes greeting text in the response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            conversation: {
              id: "conv-3",
              title: "New Chat",
              roomId: "room-3",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            greeting: {
              text: "  hello world  ",
              agentName: "Milady",
              generated: true,
              persisted: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      writable: true,
      configurable: true,
    });

    const client = new MiladyClient("http://localhost:2138");
    const result = await client.createConversation(undefined, {
      includeGreeting: true,
    });

    expect(result.greeting?.text).toBe("hello world");
  });
});
