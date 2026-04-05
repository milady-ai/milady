/**
 * Route-level tests for vincent-routes.ts — the server-side PKCE flow that
 * backs Vincent OAuth login.  These are the security-critical gate: state
 * validation, PKCE-backed token exchange, OAuth error reflection, and token
 * persistence all live behind GET /callback/vincent.
 *
 * What's covered here (per PR #1685 review):
 *   1. GET /callback/vincent with missing state       → 400 HTML
 *   2. GET /callback/vincent with unknown state       → 400 HTML ("expired")
 *   3. GET /callback/vincent with oauth `error` param → 400 HTML, value escaped
 *   4. Happy path start-login → callback → saveElizaConfig(tokens) + 200 HTML
 *   5. State is single-use: a replay of a completed callback returns 400
 *   6. Upstream token exchange failure                → 502 HTML
 */

import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const saveElizaConfigMock = vi.fn();
vi.mock("@miladyai/agent/config/config", () => ({
  saveElizaConfig: (...args: unknown[]) => saveElizaConfigMock(...args),
}));

// ── Import under test (after mocks) ─────────────────────────────────────

import type { ElizaConfig } from "@miladyai/agent/config/config";
import { handleVincentRoute } from "./vincent-routes";

// ── Test helpers ────────────────────────────────────────────────────────

interface CapturedResponse {
  statusCode: number | null;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
}

function fakeReq(
  method: string,
  url: string,
  body?: string,
): http.IncomingMessage {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const req = {
    method,
    url,
    headers: { host: "127.0.0.1:31337" },
    on(event: string, cb: (...args: unknown[]) => void) {
      const bucket = listeners[event] ?? [];
      bucket.push(cb);
      listeners[event] = bucket;
      return this;
    },
  } as unknown as http.IncomingMessage;

  // If a body was provided, schedule a microtask that feeds it to readBody().
  if (body !== undefined) {
    queueMicrotask(() => {
      for (const cb of listeners.data ?? []) cb(Buffer.from(body));
      for (const cb of listeners.end ?? []) cb();
    });
  } else {
    queueMicrotask(() => {
      for (const cb of listeners.end ?? []) cb();
    });
  }
  return req;
}

function fakeRes(): {
  res: http.ServerResponse;
  captured: CapturedResponse;
} {
  const captured: CapturedResponse = {
    statusCode: null,
    headers: {},
    body: "",
    headersSent: false,
  };
  const res = {
    get statusCode() {
      return captured.statusCode ?? 200;
    },
    set statusCode(v: number) {
      captured.statusCode = v;
    },
    get headersSent() {
      return captured.headersSent;
    },
    setHeader(name: string, value: string | number | string[]) {
      captured.headers[name.toLowerCase()] = String(value);
    },
    end(data?: string | Buffer) {
      if (data !== undefined) captured.body = String(data);
      captured.headersSent = true;
    },
  } as unknown as http.ServerResponse;
  return { res, captured };
}

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status: number;
    body: unknown;
  }>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status,
      statusText: r.ok ? "OK" : "Error",
      json: vi.fn().mockResolvedValue(r.body),
      text: vi
        .fn()
        .mockResolvedValue(
          typeof r.body === "string" ? r.body : JSON.stringify(r.body),
        ),
    } as unknown as Response);
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeConfig(): ElizaConfig {
  return {} as ElizaConfig;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("vincent-routes — GET /callback/vincent", () => {
  beforeEach(() => {
    saveElizaConfigMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 HTML when the callback is missing the code param", async () => {
    const req = fakeReq("GET", "/callback/vincent");
    const { res, captured } = fakeRes();

    const handled = await handleVincentRoute(
      req,
      res,
      "/callback/vincent",
      "GET",
      { config: makeConfig() },
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    expect(captured.headers["content-type"]).toContain("text/html");
    expect(captured.body).toContain("Vincent login failed");
    expect(captured.body).toContain("did not include an authorization code");
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });

  it("returns 400 HTML when state is missing", async () => {
    const req = fakeReq("GET", "/callback/vincent?code=abc");
    const { res, captured } = fakeRes();

    await handleVincentRoute(req, res, "/callback/vincent", "GET", {
      config: makeConfig(),
    });

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toContain("did not include a state parameter");
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });

  it("returns 400 HTML when state does not match any pending login", async () => {
    const req = fakeReq(
      "GET",
      "/callback/vincent?code=abc&state=not-a-real-state",
    );
    const { res, captured } = fakeRes();

    await handleVincentRoute(req, res, "/callback/vincent", "GET", {
      config: makeConfig(),
    });

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toContain("Vincent login expired");
    expect(captured.body).toContain("No pending login was found");
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });

  it("returns 400 HTML with escaped OAuth error output (XSS guard)", async () => {
    const req = fakeReq(
      "GET",
      "/callback/vincent?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    );
    const { res, captured } = fakeRes();

    await handleVincentRoute(req, res, "/callback/vincent", "GET", {
      config: makeConfig(),
    });

    expect(captured.statusCode).toBe(400);
    expect(captured.headers["content-type"]).toContain("text/html");
    // Escaped output must appear…
    expect(captured.body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // …and the raw tag must NOT.
    expect(captured.body).not.toContain("<script>alert(1)</script>");
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });

  it("returns 502 HTML when Vincent's token endpoint fails", async () => {
    // 1st fetch = register (success), 2nd fetch = token (failure)
    mockFetchSequence([
      { ok: true, status: 200, body: { client_id: "vcl_test" } },
      { ok: false, status: 400, body: { error: "invalid_request" } },
    ]);

    const config = makeConfig();

    // Seed a pending login via start-login
    const startReq = fakeReq(
      "POST",
      "/api/vincent/start-login",
      JSON.stringify({ appName: "Milady" }),
    );
    const { res: startRes, captured: startCap } = fakeRes();
    await handleVincentRoute(
      startReq,
      startRes,
      "/api/vincent/start-login",
      "POST",
      { config },
    );
    expect(startCap.statusCode).toBe(200);
    const { state } = JSON.parse(startCap.body) as { state: string };
    expect(state).toBeTruthy();

    // Hit the callback with a valid state — upstream token exchange fails
    const cbReq = fakeReq(
      "GET",
      `/callback/vincent?code=authcode&state=${state}`,
    );
    const { res: cbRes, captured: cbCap } = fakeRes();
    await handleVincentRoute(cbReq, cbRes, "/callback/vincent", "GET", {
      config,
    });

    expect(cbCap.statusCode).toBe(502);
    expect(cbCap.body).toContain("Token exchange with Vincent failed");
    expect(saveElizaConfigMock).not.toHaveBeenCalled();
  });

  it("happy path: start-login → callback persists tokens and returns 200 HTML", async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: { client_id: "vcl_happy" } },
      {
        ok: true,
        status: 200,
        body: {
          access_token: "tok_access",
          refresh_token: "tok_refresh",
        },
      },
    ]);

    const config = makeConfig();

    // Seed pending login
    const startReq = fakeReq(
      "POST",
      "/api/vincent/start-login",
      JSON.stringify({ appName: "Milady" }),
    );
    const { res: startRes, captured: startCap } = fakeRes();
    await handleVincentRoute(
      startReq,
      startRes,
      "/api/vincent/start-login",
      "POST",
      { config },
    );
    expect(startCap.statusCode).toBe(200);
    const startBody = JSON.parse(startCap.body) as {
      authUrl: string;
      state: string;
      redirectUri: string;
    };
    expect(startBody.authUrl).toContain("heyvincent.ai");
    expect(startBody.authUrl).toContain(`state=${startBody.state}`);
    expect(startBody.authUrl).toContain(
      `redirect_uri=${encodeURIComponent("http://127.0.0.1:31337/callback/vincent")}`,
    );
    expect(startBody.redirectUri).toBe(
      "http://127.0.0.1:31337/callback/vincent",
    );

    // Now hit the callback with that state
    const cbReq = fakeReq(
      "GET",
      `/callback/vincent?code=live_code&state=${startBody.state}`,
    );
    const { res: cbRes, captured: cbCap } = fakeRes();
    await handleVincentRoute(cbReq, cbRes, "/callback/vincent", "GET", {
      config,
    });

    expect(cbCap.statusCode).toBe(200);
    expect(cbCap.headers["content-type"]).toContain("text/html");
    expect(cbCap.body).toContain("Vincent connected");
    expect(cbCap.body).toContain("You can close this window");

    // Tokens must have been persisted via saveElizaConfig with the exact
    // values returned by the (mocked) token endpoint.
    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
    const persisted = saveElizaConfigMock.mock.calls[0][0] as {
      vincent?: {
        accessToken: string;
        refreshToken: string | null;
        clientId: string;
        connectedAt: number;
      };
    };
    expect(persisted.vincent).toBeDefined();
    expect(persisted.vincent?.accessToken).toBe("tok_access");
    expect(persisted.vincent?.refreshToken).toBe("tok_refresh");
    expect(persisted.vincent?.clientId).toBe("vcl_happy");
    expect(typeof persisted.vincent?.connectedAt).toBe("number");

    // Verify redirect_uri was included in the token exchange body (RFC 6749
    // §4.1.3 — Vincent rejects the exchange without it).
    const fetchMock = (globalThis as { fetch?: ReturnType<typeof vi.fn> })
      .fetch as ReturnType<typeof vi.fn>;
    const tokenCall = fetchMock.mock.calls[1];
    const tokenBody = JSON.parse(
      (tokenCall[1] as { body: string }).body,
    ) as Record<string, string>;
    expect(tokenBody.redirect_uri).toBe(
      "http://127.0.0.1:31337/callback/vincent",
    );
    expect(tokenBody.grant_type).toBe("authorization_code");
    expect(tokenBody.code).toBe("live_code");
    expect(tokenBody.client_id).toBe("vcl_happy");
    expect(tokenBody.code_verifier).toBeTruthy();
  });

  it("state is single-use: replaying the same state after success returns 400", async () => {
    // Register + token success for the first callback, then register only
    // for a would-be second start (not exercised) — we only need two entries.
    mockFetchSequence([
      { ok: true, status: 200, body: { client_id: "vcl_replay" } },
      {
        ok: true,
        status: 200,
        body: { access_token: "tok_r", refresh_token: null },
      },
    ]);

    const config = makeConfig();

    // start-login
    const startReq = fakeReq(
      "POST",
      "/api/vincent/start-login",
      JSON.stringify({}),
    );
    const { res: startRes, captured: startCap } = fakeRes();
    await handleVincentRoute(
      startReq,
      startRes,
      "/api/vincent/start-login",
      "POST",
      { config },
    );
    const { state } = JSON.parse(startCap.body) as { state: string };

    // First callback succeeds
    const cb1Req = fakeReq(
      "GET",
      `/callback/vincent?code=first&state=${state}`,
    );
    const { res: cb1Res, captured: cb1Cap } = fakeRes();
    await handleVincentRoute(cb1Req, cb1Res, "/callback/vincent", "GET", {
      config,
    });
    expect(cb1Cap.statusCode).toBe(200);
    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);

    // Replay with the same state — must be rejected
    const cb2Req = fakeReq(
      "GET",
      `/callback/vincent?code=replay&state=${state}`,
    );
    const { res: cb2Res, captured: cb2Cap } = fakeRes();
    await handleVincentRoute(cb2Req, cb2Res, "/callback/vincent", "GET", {
      config,
    });
    expect(cb2Cap.statusCode).toBe(400);
    expect(cb2Cap.body).toContain("Vincent login expired");
    // saveElizaConfig was NOT called a second time.
    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
  });
});

describe("vincent-routes — /api/vincent/status and /api/vincent/disconnect", () => {
  beforeEach(() => {
    saveElizaConfigMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/vincent/status reflects persisted tokens", async () => {
    const config = {
      vincent: {
        accessToken: "tok",
        refreshToken: null,
        clientId: "vcl_x",
        connectedAt: 1_700_000_000,
      },
    } as unknown as ElizaConfig;

    const req = fakeReq("GET", "/api/vincent/status");
    const { res, captured } = fakeRes();
    await handleVincentRoute(req, res, "/api/vincent/status", "GET", {
      config,
    });

    expect(captured.statusCode).toBe(200);
    const payload = JSON.parse(captured.body) as {
      connected: boolean;
      connectedAt: number | null;
    };
    expect(payload.connected).toBe(true);
    expect(payload.connectedAt).toBe(1_700_000_000);
  });

  it("GET /api/vincent/status reports disconnected when no tokens", async () => {
    const req = fakeReq("GET", "/api/vincent/status");
    const { res, captured } = fakeRes();
    await handleVincentRoute(req, res, "/api/vincent/status", "GET", {
      config: makeConfig(),
    });

    expect(captured.statusCode).toBe(200);
    const payload = JSON.parse(captured.body) as { connected: boolean };
    expect(payload.connected).toBe(false);
  });

  it("POST /api/vincent/disconnect clears tokens via saveElizaConfig", async () => {
    const config = {
      vincent: {
        accessToken: "tok",
        refreshToken: null,
        clientId: "vcl_x",
        connectedAt: 1_700_000_000,
      },
    } as unknown as ElizaConfig;

    const req = fakeReq("POST", "/api/vincent/disconnect");
    const { res, captured } = fakeRes();
    await handleVincentRoute(req, res, "/api/vincent/disconnect", "POST", {
      config,
    });

    expect(captured.statusCode).toBe(200);
    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
    const saved = saveElizaConfigMock.mock.calls[0][0] as {
      vincent?: unknown;
    };
    expect(saved.vincent).toBeUndefined();
  });
});
