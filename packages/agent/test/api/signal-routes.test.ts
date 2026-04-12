import { describe, expect, test, vi } from "vitest";
import type {
  SignalRouteDeps,
  SignalRouteState,
} from "../../src/api/signal-routes";
import { handleSignalRoute } from "../../src/api/signal-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildState(
  overrides: Partial<SignalRouteState> = {},
): SignalRouteState {
  return {
    signalPairingSessions: new Map(),
    signalPairingSnapshots: new Map(),
    broadcastWs: vi.fn(),
    config: {},
    runtime: undefined,
    saveConfig: vi.fn(),
    workspaceDir: "/tmp/test-workspace",
    ...overrides,
  };
}

function buildDeps(overrides: Partial<SignalRouteDeps> = {}): SignalRouteDeps {
  return {
    sanitizeAccountId: vi.fn((id: string) => id),
    signalAuthExists: vi.fn(() => false),
    signalLogout: vi.fn(),
    createSignalPairingSession: vi.fn(() => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      getStatus: vi.fn(() => "waiting_for_qr"),
      getSnapshot: vi.fn(() => ({
        status: "waiting_for_qr",
        qrDataUrl: "data:image/png;base64,signal",
        phoneNumber: null,
        error: null,
      })),
    })),
    ...overrides,
  };
}

describe("handleSignalRoute", () => {
  test("returns false for unrelated path", async () => {
    const req = createMockIncomingMessage({ method: "GET", url: "/api/other" });
    const { res } = createMockHttpResponse();
    const state = buildState();
    const deps = buildDeps();

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/other",
      "GET",
      state,
      deps,
    );

    expect(handled).toBe(false);
  });

  test("POST /api/signal/pair creates a pairing session", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/signal/pair",
      body: JSON.stringify({ accountId: "test-account" }),
      headers: { host: "localhost:2138", "content-type": "application/json" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const state = buildState();
    const deps = buildDeps();

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/signal/pair",
      "POST",
      state,
      deps,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    const json = getJson<{
      ok: boolean;
      accountId: string;
      status: string;
      qrDataUrl: string | null;
    }>();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("waiting_for_qr");
    expect(json.qrDataUrl).toBe("data:image/png;base64,signal");
  });

  test("POST /api/signal/pair returns 400 when sanitizeAccountId throws", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/signal/pair",
      body: JSON.stringify({ accountId: "" }),
      headers: { host: "localhost:2138", "content-type": "application/json" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const state = buildState();
    const deps = buildDeps({
      sanitizeAccountId: vi.fn(() => {
        throw new Error("Invalid account ID");
      }),
    });

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/signal/pair",
      "POST",
      state,
      deps,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson<{ error: string }>().error).toBe("Invalid account ID");
  });

  test("GET /api/signal/status returns the active pairing snapshot", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/signal/status?accountId=test-account",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      accountId: string;
      status: string;
      qrDataUrl: string | null;
      phoneNumber: string | null;
      error: string | null;
    }>();
    const state = buildState({
      signalPairingSessions: new Map([
        [
          "test-account",
          {
            start: vi.fn(async () => {}),
            stop: vi.fn(),
            getStatus: vi.fn(() => "waiting_for_qr"),
            getSnapshot: vi.fn(() => ({
              status: "waiting_for_qr",
              qrDataUrl: "data:image/png;base64,live",
              phoneNumber: null,
              error: null,
            })),
          },
        ],
      ]),
    });

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/signal/status",
      "GET",
      state,
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      accountId: "test-account",
      status: "waiting_for_qr",
      qrDataUrl: "data:image/png;base64,live",
      phoneNumber: null,
      error: null,
    });
  });

  test("GET /api/signal/status returns the last terminal snapshot when no live session remains", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/signal/status?accountId=test-account",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      accountId: string;
      status: string;
      qrDataUrl: string | null;
      phoneNumber: string | null;
      error: string | null;
    }>();
    const state = buildState({
      signalPairingSnapshots: new Map([
        [
          "test-account",
          {
            status: "error",
            qrDataUrl: null,
            phoneNumber: null,
            error: "missing signal-cli",
          },
        ],
      ]),
    });

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/signal/status",
      "GET",
      state,
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      accountId: "test-account",
      status: "error",
      error: "missing signal-cli",
    });
  });

  test("GET /api/signal/status stays idle when no linked account exists", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/signal/status?accountId=test-account",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      accountId: string;
      status: string;
      authExists: boolean;
      serviceConnected: boolean;
    }>();

    const handled = await handleSignalRoute(
      req,
      res,
      "/api/signal/status",
      "GET",
      buildState(),
      buildDeps({
        signalAuthExists: vi.fn(() => false),
      }),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      accountId: "test-account",
      status: "idle",
      authExists: false,
      serviceConnected: false,
    });
  });

  test("removes terminal pairing sessions after they connect", async () => {
    let emitConnected: (() => void) | null = null;
    const state = buildState();
    const deps = buildDeps({
      createSignalPairingSession: vi.fn(({ onEvent }) => {
        emitConnected = () => {
          onEvent({
            type: "signal-status",
            accountId: "default",
            status: "connected",
            phoneNumber: "+15551234567",
          });
        };
        return {
          start: vi.fn(async () => {
            emitConnected?.();
          }),
          stop: vi.fn(),
          getStatus: vi.fn(() => "initializing"),
          getSnapshot: vi.fn(() => ({
            status: "initializing",
            qrDataUrl: null,
            phoneNumber: null,
            error: null,
          })),
        };
      }),
    });

    const handled = await handleSignalRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/signal/pair",
        body: JSON.stringify({ accountId: "default" }),
        headers: {
          host: "localhost:2138",
          "content-type": "application/json",
        },
      }),
      createMockHttpResponse().res,
      "/api/signal/pair",
      "POST",
      state,
      deps,
    );

    expect(handled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.signalPairingSessions.size).toBe(0);
    expect(state.saveConfig).toHaveBeenCalledOnce();
    expect(state.config).toMatchObject({
      connectors: {
        signal: {
          enabled: true,
          account: "+15551234567",
        },
      },
    });
  });

  test("POST /api/signal/disconnect returns 500 when logout fails", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();
    const state = buildState({
      config: { connectors: { signal: { enabled: true } } },
    });

    await handleSignalRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/signal/disconnect",
        body: JSON.stringify({ accountId: "default" }),
        headers: {
          host: "localhost:2138",
          "content-type": "application/json",
        },
      }),
      res,
      "/api/signal/disconnect",
      "POST",
      state,
      buildDeps({
        signalLogout: vi.fn(() => {
          throw new Error("disk is read-only");
        }),
      }),
    );

    expect(getStatus()).toBe(500);
    expect(getJson().error).toContain("Failed to disconnect Signal");
    expect(state.config.connectors?.signal).toEqual({ enabled: true });
  });
});
