import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomActionDef } from "../config/types.milady";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup as dnsLookup } from "node:dns/promises";
import { buildTestHandler } from "./custom-actions";

const dnsLookupMock = dnsLookup as unknown as {
  mockResolvedValue: (
    value: Array<{ address: string; family: number }>,
  ) => void;
  mockClear: () => void;
  mockReset: () => void;
  mockRestore: () => void;
  mock: {
    calls: unknown[][];
  };
};

function makeHttpAction(url: string): CustomActionDef {
  return {
    id: "test-action",
    name: "TEST_HTTP_ACTION",
    description: "test",
    similes: [],
    parameters: [],
    handler: {
      type: "http",
      method: "GET",
      url,
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function makeCodeAction(code: string): CustomActionDef {
  return {
    id: "code-action",
    name: "CODE_ACTION",
    description: "test",
    similes: [],
    parameters: [],
    handler: {
      type: "code",
      code,
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("custom action SSRF guard", () => {
  const CODE_HANDLER_MODE_ENV = "MILADY_CODE_HANDLER_EXECUTION_MODE";
  const previousCodeHandlerMode = process.env[CODE_HANDLER_MODE_ENV];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousCodeHandlerMode === undefined) {
      delete process.env[CODE_HANDLER_MODE_ENV];
    } else {
      process.env[CODE_HANDLER_MODE_ENV] = previousCodeHandlerMode;
    }
  });

  it("rejects hostname aliases resolving to link-local metadata IPs", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(
      makeHttpAction("http://169.254.169.254.nip.io/latest/meta-data"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects hostname aliases resolving to loopback", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(
      makeHttpAction("http://localhost.nip.io:2138/api/status"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows explicit localhost API target on the configured API port", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);

    const handler = buildTestHandler(
      makeHttpAction("http://localhost:2138/api/status"),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(dnsLookupMock.mock.calls.length).toBe(0);
  });

  it("allows public hosts when DNS resolves to public IPs", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, text: async () => "ok" } as Response);

    const handler = buildTestHandler(
      makeHttpAction("https://example.com/test"),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks redirect responses and uses manual redirect mode", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: new Headers({ location: "http://169.254.169.254/latest" }),
      text: async () => "",
    } as Response);

    const handler = buildTestHandler(
      makeHttpAction("https://example.com/redirect"),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("redirects are not allowed");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/redirect",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects non-http/https custom action targets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const handler = buildTestHandler(makeHttpAction("file:///tmp/secret.txt"));

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not expose Node globals to code handlers", async () => {
    const handler = buildTestHandler(
      makeCodeAction(
        "return JSON.stringify({ processType: typeof process, requireType: typeof require, fetchType: typeof fetch });",
      ),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe(
      JSON.stringify({
        processType: "undefined",
        requireType: "undefined",
        fetchType: "function",
      }),
    );
  });

  it("blocks constructor-chain escapes in code handlers", async () => {
    const handler = buildTestHandler(
      makeCodeAction(
        "return String(typeof ({}).constructor.constructor('return process')());",
      ),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("undefined");
  });

  it("blocks code handlers from fetching internal hosts", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const handler = buildTestHandler(
      makeCodeAction(
        "await fetch('http://10.0.0.1:2138/secret'); return 'done';",
      ),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("supports code handler fetch with the same redirect and allowlisting policy", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "ok",
      status: 200,
      statusText: "OK",
      headers: new Headers(),
    } as Response);

    const handler = buildTestHandler(
      makeCodeAction(
        "const response = await fetch('https://example.com/ok'); return response.text();",
      ),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/ok",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("supports legacy code handler execution when explicitly enabled", async () => {
    process.env[CODE_HANDLER_MODE_ENV] = "legacy";

    const handler = buildTestHandler(
      makeCodeAction(
        "return JSON.stringify({ processType: typeof process, requireType: typeof require });",
      ),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toBe(
      JSON.stringify({
        processType: "object",
        requireType: "function",
      }),
    );
  });
});
