import { describe, expect, test, vi } from "vitest";
import type {
  WhatsAppRouteDeps,
  WhatsAppRouteState,
} from "../../src/api/whatsapp-routes";
import { handleWhatsAppRoute } from "../../src/api/whatsapp-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildState(
  overrides: Partial<WhatsAppRouteState> = {},
): WhatsAppRouteState {
  return {
    whatsappPairingSessions: new Map(),
    broadcastWs: vi.fn(),
    config: {},
    runtime: undefined,
    saveConfig: vi.fn(),
    workspaceDir: "/tmp/test-workspace",
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<WhatsAppRouteDeps> = {},
): WhatsAppRouteDeps {
  return {
    sanitizeAccountId: vi.fn((id: string) => id),
    whatsappAuthExists: vi.fn(() => false),
    whatsappLogout: vi.fn(async () => {}),
    createWhatsAppPairingSession: vi.fn(() => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      getStatus: vi.fn(() => "pairing"),
    })),
    ...overrides,
  };
}

describe("handleWhatsAppRoute", () => {
  test("GET /api/whatsapp/webhook returns 503 when the service is unavailable", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=12345",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "GET",
      buildState({
        runtime: {
          getService: () => null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("WhatsApp service unavailable");
  });

  test("GET /api/whatsapp/webhook returns the verification challenge", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=12345",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus } = createMockHttpResponse();
    const verifyWebhook = vi.fn(() => "12345");

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "GET",
      buildState({
        runtime: {
          getService: (type: string) =>
            type === "whatsapp" ? { verifyWebhook } : null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(verifyWebhook).toHaveBeenCalledWith(
      "subscribe",
      "test-token",
      "12345",
    );
    expect(getStatus()).toBe(200);
    expect(res._body).toBe("12345");
  });

  test("GET /api/whatsapp/webhook rejects invalid verification tokens", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "GET",
      buildState({
        runtime: {
          getService: (type: string) =>
            type === "whatsapp"
              ? { verifyWebhook: vi.fn(() => null) }
              : null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(403);
    expect(getJson().error).toBe("Webhook verification failed");
  });

  test("POST /api/whatsapp/webhook forwards the event to the runtime service", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/whatsapp/webhook",
      headers: { host: "localhost:2138", "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ id: "entry-1", changes: [] }],
      }),
    });
    const { res, getStatus } = createMockHttpResponse();
    const handleWebhook = vi.fn(async () => {});

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "POST",
      buildState({
        runtime: {
          getService: (type: string) =>
            type === "whatsapp" ? { handleWebhook } : null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(handleWebhook).toHaveBeenCalledWith({
      object: "whatsapp_business_account",
      entry: [{ id: "entry-1", changes: [] }],
    });
    expect(getStatus()).toBe(200);
    expect(res._body).toBe("EVENT_RECEIVED");
  });

  test("POST /api/whatsapp/webhook returns 503 when the service is unavailable", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/whatsapp/webhook",
      headers: { host: "localhost:2138", "content-type": "application/json" },
      body: JSON.stringify({
        object: "whatsapp_business_account",
        entry: [],
      }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "POST",
      buildState({
        runtime: {
          getService: () => null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(503);
    expect(getJson().error).toBe("WhatsApp service unavailable");
  });

  test("POST /api/whatsapp/webhook rejects invalid JSON bodies", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/whatsapp/webhook",
      headers: { host: "localhost:2138", "content-type": "application/json" },
      body: '{"object":',
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();
    const handleWebhook = vi.fn(async () => {});

    const handled = await handleWhatsAppRoute(
      req,
      res,
      "/api/whatsapp/webhook",
      "POST",
      buildState({
        runtime: {
          getService: (type: string) =>
            type === "whatsapp" ? { handleWebhook } : null,
        },
      }),
      buildDeps(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toBe("Invalid JSON in request body");
    expect(handleWebhook).not.toHaveBeenCalled();
  });
});
