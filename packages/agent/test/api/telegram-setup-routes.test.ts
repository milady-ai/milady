import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  handleTelegramSetupRoute,
  type TelegramSetupRouteState,
} from "../../src/api/telegram-setup-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";
import {
  readJsonBody,
  sendJson,
  sendJsonError,
} from "../../src/api/http-helpers";

const routeHelpers = {
  json: sendJson,
  error: sendJsonError,
  readJsonBody,
};

function buildState(
  overrides: Partial<TelegramSetupRouteState> = {},
): TelegramSetupRouteState {
  return {
    config: {},
    saveConfig: vi.fn(),
    runtime: undefined,
    ...overrides,
  };
}

describe("handleTelegramSetupRoute", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 123456,
            is_bot: true,
            first_name: "Milady Bot",
            username: "milady_bot",
          },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("persists bot auth only into connectors.telegram", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/telegram-setup/validate-token",
      body: JSON.stringify({ token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456" }),
      headers: { "content-type": "application/json", host: "localhost:31337" },
    });
    const { res, getJson } = createMockHttpResponse();
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
    });

    const handled = await handleTelegramSetupRoute(
      req,
      res,
      "/api/telegram-setup/validate-token",
      "POST",
      state,
      routeHelpers,
    );

    expect(handled).toBe(true);
    expect(getJson()).toMatchObject({
      ok: true,
      bot: { username: "milady_bot" },
    });
    expect(
      (
        state.config.connectors as Record<string, Record<string, unknown>>
      ).telegram,
    ).toMatchObject({
      botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
    });
    expect(
      (
        state.config.connectors as Record<string, Record<string, unknown>>
      ).telegramAccount,
    ).toMatchObject({
      enabled: true,
      phone: "+15551234567",
      appId: "12345",
    });
  });
});
