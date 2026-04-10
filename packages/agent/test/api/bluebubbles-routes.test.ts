import { describe, expect, it, vi } from "vitest";
import type {
  BlueBubblesRouteState,
} from "../../src/api/bluebubbles-routes";
import {
  handleBlueBubblesRoute,
  resolveBlueBubblesWebhookPath,
} from "../../src/api/bluebubbles-routes";
import { readJsonBody, sendJson, sendJsonError } from "../../src/api/http-helpers";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildState(
  overrides: Partial<BlueBubblesRouteState> = {},
): BlueBubblesRouteState {
  return {
    runtime: undefined,
    ...overrides,
  };
}

const helpers = {
  json: sendJson,
  error: sendJsonError,
  readJsonBody,
};

describe("BlueBubbles routes", () => {
  it("uses the default webhook path when the service is unavailable", () => {
    expect(resolveBlueBubblesWebhookPath(buildState())).toBe(
      "/webhooks/bluebubbles",
    );
  });

  it("reports unavailable status when the service is not registered", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/bluebubbles/status",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      available: boolean;
      connected: boolean;
      webhookPath: string;
      reason: string;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/api/bluebubbles/status",
      "GET",
      buildState(),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      available: false,
      connected: false,
      webhookPath: "/webhooks/bluebubbles",
    });
  });

  it("rejects malformed webhook payloads", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/webhooks/bluebubbles",
      headers: {
        host: "localhost:2138",
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "", data: null }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/webhooks/bluebubbles",
      "POST",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => "/webhooks/bluebubbles"),
            handleWebhook: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toBe("invalid BlueBubbles webhook payload");
  });

  it("forwards valid webhook payloads to the BlueBubbles service", async () => {
    const handleWebhook = vi.fn(async () => {});
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/webhooks/bluebubbles",
      headers: {
        host: "localhost:2138",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "new-message",
        data: { chatGuid: "chat-1" },
      }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      ok: boolean;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/webhooks/bluebubbles",
      "POST",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => "/webhooks/bluebubbles"),
            handleWebhook,
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ ok: true });
    expect(handleWebhook).toHaveBeenCalledWith({
      type: "new-message",
      data: { chatGuid: "chat-1" },
    });
  });
});
