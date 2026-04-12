import { describe, expect, it, vi } from "vitest";
import type { BlueBubblesRouteState } from "../../src/api/bluebubbles-routes";
import {
  handleBlueBubblesRoute,
  resolveBlueBubblesWebhookPath,
} from "../../src/api/bluebubbles-routes";
import {
  readJsonBody,
  sendJson,
  sendJsonError,
} from "../../src/api/http-helpers";
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

  it("reports the resolved webhook path even when the service path is blank", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/bluebubbles/status",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      available: boolean;
      connected: boolean;
      webhookPath: string;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/api/bluebubbles/status",
      "GET",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => " "),
            getClient: vi.fn(() => null),
            handleWebhook: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      available: true,
      connected: true,
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
            getClient: vi.fn(() => null),
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
            getClient: vi.fn(() => null),
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

  it("lists chats through the BlueBubbles client", async () => {
    const listChats = vi.fn(async () => [
      { guid: "chat-1", chatIdentifier: "+15551234567" },
    ]);
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/bluebubbles/chats?limit=5&offset=2",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      chats: Array<{ guid: string; chatIdentifier: string }>;
      count: number;
      limit: number;
      offset: number;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/api/bluebubbles/chats",
      "GET",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => "/webhooks/bluebubbles"),
            getClient: vi.fn(() => ({ listChats, getMessages: vi.fn() })),
            handleWebhook: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      chats: [{ guid: "chat-1", chatIdentifier: "+15551234567" }],
      count: 1,
      limit: 5,
      offset: 2,
    });
    expect(listChats).toHaveBeenCalledWith(5, 2);
  });

  it("requires chatGuid when listing bluebubbles messages", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/bluebubbles/messages",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/api/bluebubbles/messages",
      "GET",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => "/webhooks/bluebubbles"),
            getClient: vi.fn(() => ({ listChats: vi.fn(), getMessages: vi.fn() })),
            handleWebhook: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "chatGuid query parameter is required",
    });
  });

  it("lists messages through the BlueBubbles client", async () => {
    const getMessages = vi.fn(async () => [{ guid: "msg-1", text: "hi" }]);
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/bluebubbles/messages?chatGuid=chat-1&limit=2&offset=1",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      chatGuid: string;
      messages: Array<{ guid: string; text: string }>;
      count: number;
      limit: number;
      offset: number;
    }>();

    const handled = await handleBlueBubblesRoute(
      req,
      res,
      "/api/bluebubbles/messages",
      "GET",
      buildState({
        runtime: {
          getService: () => ({
            isConnected: vi.fn(() => true),
            getWebhookPath: vi.fn(() => "/webhooks/bluebubbles"),
            getClient: vi.fn(() => ({ listChats: vi.fn(), getMessages })),
            handleWebhook: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      chatGuid: "chat-1",
      messages: [{ guid: "msg-1", text: "hi" }],
      count: 1,
      limit: 2,
      offset: 1,
    });
    expect(getMessages).toHaveBeenCalledWith("chat-1", 2, 1);
  });
});
