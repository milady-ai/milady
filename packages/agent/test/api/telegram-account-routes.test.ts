import { describe, expect, test, vi } from "vitest";
import {
  readJsonBody,
  sendJson,
  sendJsonError,
} from "../../src/api/http-helpers";
import type {
  TelegramAccountAuthSessionLike,
  TelegramAccountAuthSnapshot,
} from "../../src/services/telegram-account-auth";
import {
  handleTelegramAccountRoute,
  type TelegramAccountRouteDeps,
  type TelegramAccountRouteState,
} from "../../src/api/telegram-account-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const routeHelpers = {
  json: sendJson,
  error: sendJsonError,
  readJsonBody,
};

function buildState(
  overrides: Partial<TelegramAccountRouteState> = {},
): TelegramAccountRouteState {
  return {
    config: {},
    saveConfig: vi.fn(),
    runtime: undefined,
    telegramAccountAuthSession: null,
    ...overrides,
  };
}

function buildSession() {
  let snapshot: TelegramAccountAuthSnapshot = {
    status: "idle",
    phone: null,
    error: null,
    isCodeViaApp: false,
    account: null,
  };
  let resolvedConfig:
    | {
        phone: string;
        appId: string;
        appHash: string;
        deviceModel: string;
        systemVersion: string;
        enabled: true;
      }
    | null = null;

  return {
    session: {
      start: vi.fn(async ({ phone, credentials }) => {
        if (credentials) {
          snapshot = {
            status: "configured",
            phone,
            error: null,
            isCodeViaApp: false,
            account: {
              id: "me",
              username: "shaw",
              firstName: "Shaw",
              lastName: null,
              phone,
            },
          };
          resolvedConfig = {
            phone,
            appId: String(credentials.apiId),
            appHash: credentials.apiHash,
            deviceModel: "Milady Desktop",
            systemVersion: "macOS test",
            enabled: true,
          };
          return snapshot;
        }
        snapshot = {
          status: "waiting_for_provisioning_code",
          phone,
          error: null,
          isCodeViaApp: false,
          account: null,
        };
        return snapshot;
      }),
      submit: vi.fn(
        async ({
          provisioningCode,
          telegramCode,
          password,
        }: {
          provisioningCode?: string;
          telegramCode?: string;
          password?: string;
        }) => {
          if (provisioningCode) {
            snapshot = {
              ...snapshot,
              status: "waiting_for_telegram_code",
            };
          } else if (telegramCode) {
            snapshot = {
              ...snapshot,
              status: "waiting_for_password",
              isCodeViaApp: true,
            };
          } else if (password) {
            snapshot = {
              status: "configured",
              phone: snapshot.phone,
              error: null,
              isCodeViaApp: false,
              account: {
                id: "me",
                username: "shaw",
                firstName: "Shaw",
                lastName: null,
                phone: snapshot.phone,
              },
            };
            resolvedConfig = {
              phone: snapshot.phone ?? "+15551234567",
              appId: "12345",
              appHash: "hash",
              deviceModel: "Milady Desktop",
              systemVersion: "macOS test",
              enabled: true,
            };
          }
          return snapshot;
        },
      ),
      stop: vi.fn(async () => {}),
      getSnapshot: vi.fn(() => snapshot),
      getResolvedConnectorConfig: vi.fn(() => resolvedConfig),
    } satisfies TelegramAccountAuthSessionLike,
    getSnapshot: () => snapshot,
  };
}

function buildDeps(
  sessionFactory = buildSession,
  overrides: Partial<TelegramAccountRouteDeps> = {},
): TelegramAccountRouteDeps {
  const built = sessionFactory();
  return {
    createAuthSession: vi.fn(() => built.session),
    authStateExists: vi.fn(() => false),
    sessionExists: vi.fn(() => false),
    clearAuthState: vi.fn(),
    clearSession: vi.fn(),
    ...overrides,
  };
}

describe("handleTelegramAccountRoute", () => {
  test("returns false for unrelated paths", async () => {
    const req = createMockIncomingMessage({ method: "GET", url: "/api/other" });
    const { res } = createMockHttpResponse();

    const handled = await handleTelegramAccountRoute(
      req,
      res,
      "/api/other",
      "GET",
      buildState(),
      routeHelpers,
      buildDeps(),
    );

    expect(handled).toBe(false);
  });

  test("GET /api/telegram-account/status reports saved-but-not-running state", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/telegram-account/status",
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const deps = buildDeps(buildSession, {
      sessionExists: vi.fn(() => true),
    });

    const handled = await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/status",
      "GET",
      buildState({
        config: {
          connectors: {
            telegramAccount: {
              enabled: true,
              phone: "+15551234567",
              appId: "12345",
              appHash: "hash",
              deviceModel: "Milady Desktop",
              systemVersion: "macOS test",
            },
          },
        },
      }),
      routeHelpers,
      deps,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      status: "configured",
      configured: true,
      sessionExists: true,
      restartRequired: true,
      phone: "+15551234567",
    });
  });

  test("POST /api/telegram-account/auth/start begins provisioning without existing credentials", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/telegram-account/auth/start",
      body: JSON.stringify({ phone: "+15551234567" }),
      headers: { "content-type": "application/json" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const state = buildState();
    const deps = buildDeps();

    const handled = await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/auth/start",
      "POST",
      state,
      routeHelpers,
      deps,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      status: "waiting_for_provisioning_code",
      phone: "+15551234567",
    });
    expect(state.telegramAccountAuthSession).not.toBeNull();
  });

  test("POST /api/telegram-account/auth/submit persists connector config once configured", async () => {
    const built = buildSession();
    const deps: TelegramAccountRouteDeps = {
      createAuthSession: vi.fn(() => built.session),
      authStateExists: vi.fn(() => false),
      sessionExists: vi.fn(() => false),
      clearAuthState: vi.fn(),
      clearSession: vi.fn(),
    };
    const state = buildState({
      telegramAccountAuthSession: built.session,
    });
    await built.session.start({ phone: "+15551234567", credentials: null });
    await built.session.submit({ provisioningCode: "11111" });
    await built.session.submit({ telegramCode: "22222" });

    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/telegram-account/auth/submit",
      body: JSON.stringify({ password: "secret" }),
      headers: { "content-type": "application/json" },
    });
    const { res, getJson } = createMockHttpResponse();

    await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/auth/submit",
      "POST",
      state,
      routeHelpers,
      deps,
    );

    expect(state.saveConfig).toHaveBeenCalledOnce();
    expect(
      (
        state.config.connectors as Record<string, Record<string, unknown>>
      ).telegramAccount,
    ).toMatchObject({
      enabled: true,
      appId: "12345",
      appHash: "hash",
    });
    expect(getJson()).toMatchObject({
      status: "configured",
      restartRequired: true,
    });
  });

  test("POST /api/telegram-account/disconnect clears config and session", async () => {
    const built = buildSession();
    const deps = buildDeps(() => built, {
      clearSession: vi.fn(),
      sessionExists: vi.fn(() => false),
    });
    const serviceStop = vi.fn(async () => {});
    const state = buildState({
      config: {
        connectors: {
          telegramAccount: {
            enabled: true,
            phone: "+15551234567",
            appId: "12345",
            appHash: "hash",
            deviceModel: "Milady Desktop",
            systemVersion: "macOS test",
          },
        },
      },
      runtime: {
        getService: vi.fn(() => ({ stop: serviceStop })),
        getSetting: vi.fn(),
      },
      telegramAccountAuthSession: built.session,
    });

    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/telegram-account/disconnect",
    });
    const { res, getJson } = createMockHttpResponse();

    await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/disconnect",
      "POST",
      state,
      routeHelpers,
      deps,
    );

    expect(built.session.stop).toHaveBeenCalledOnce();
    expect(serviceStop).toHaveBeenCalledOnce();
    expect(deps.clearAuthState).toHaveBeenCalledOnce();
    expect(deps.clearSession).toHaveBeenCalledOnce();
    expect(
      (state.config.connectors as Record<string, unknown>).telegramAccount,
    ).toBeUndefined();
    expect(getJson()).toMatchObject({ ok: true, status: "idle" });
  });

  test("GET /api/telegram-account/status restores a persisted auth session", async () => {
    const built = buildSession();
    await built.session.start({ phone: "+15551234567", credentials: null });
    const deps = buildDeps(() => built, {
      authStateExists: vi.fn(() => true),
    });
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/telegram-account/status",
    });
    const { res, getJson } = createMockHttpResponse();
    const state = buildState();

    await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/status",
      "GET",
      state,
      routeHelpers,
      deps,
    );

    expect(deps.createAuthSession).toHaveBeenCalledOnce();
    expect(state.telegramAccountAuthSession).toBe(built.session);
    expect(getJson()).toMatchObject({
      status: "waiting_for_provisioning_code",
      phone: "+15551234567",
    });
  });

  test("POST /api/telegram-account/auth/submit restores a persisted auth session", async () => {
    const built = buildSession();
    await built.session.start({ phone: "+15551234567", credentials: null });
    const deps = buildDeps(() => built, {
      authStateExists: vi.fn(() => true),
    });
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/telegram-account/auth/submit",
      body: JSON.stringify({ provisioningCode: "11111" }),
      headers: { "content-type": "application/json" },
    });
    const { res, getJson } = createMockHttpResponse();
    const state = buildState();

    await handleTelegramAccountRoute(
      req,
      res,
      "/api/telegram-account/auth/submit",
      "POST",
      state,
      routeHelpers,
      deps,
    );

    expect(deps.createAuthSession).toHaveBeenCalledOnce();
    expect(built.session.submit).toHaveBeenCalledWith({
      provisioningCode: "11111",
    });
    expect(getJson()).toMatchObject({
      status: "waiting_for_telegram_code",
      phone: "+15551234567",
    });
  });
});
