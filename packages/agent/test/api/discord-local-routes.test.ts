import { describe, expect, it, vi } from "vitest";
import type {
  DiscordLocalRouteState,
} from "../../src/api/discord-local-routes";
import { handleDiscordLocalRoute } from "../../src/api/discord-local-routes";
import { readJsonBody, sendJson, sendJsonError } from "../../src/api/http-helpers";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

function buildState(
  overrides: Partial<DiscordLocalRouteState> = {},
): DiscordLocalRouteState {
  return {
    config: { connectors: {} },
    saveConfig: vi.fn(),
    runtime: undefined,
    ...overrides,
  };
}

const helpers = {
  json: sendJson,
  error: sendJsonError,
  readJsonBody,
};

describe("handleDiscordLocalRoute", () => {
  it("reports unavailable status when the service is not registered", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/discord-local/status",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      available: boolean;
      connected: boolean;
      authenticated: boolean;
      reason: string;
    }>();

    const handled = await handleDiscordLocalRoute(
      req,
      res,
      "/api/discord-local/status",
      "GET",
      buildState(),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({
      available: false,
      connected: false,
      authenticated: false,
    });
  });

  it("rejects channel lookups without a guild id", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/discord-local/channels",
      headers: { host: "localhost:2138" },
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      error: string;
    }>();

    const handled = await handleDiscordLocalRoute(
      req,
      res,
      "/api/discord-local/channels",
      "GET",
      buildState({
        runtime: {
          getService: () => ({
            getStatus: vi.fn(),
            authorize: vi.fn(),
            disconnectSession: vi.fn(),
            listGuilds: vi.fn(),
            listChannels: vi.fn(),
            subscribeChannelMessages: vi.fn(),
          }),
        },
      }),
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson().error).toBe("guildId is required");
  });

  it("persists the subscribed channel ids returned by the service", async () => {
    const subscribeChannelMessages = vi.fn(async () => ["channel-a"]);
    const state = buildState({
      config: { connectors: { discordLocal: { enabled: true } } },
      runtime: {
        getService: () => ({
          getStatus: vi.fn(),
          authorize: vi.fn(),
          disconnectSession: vi.fn(),
          listGuilds: vi.fn(),
          listChannels: vi.fn(),
          subscribeChannelMessages,
        }),
      },
    });
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/discord-local/subscriptions",
      headers: {
        host: "localhost:2138",
        "content-type": "application/json",
      },
      body: JSON.stringify({ channelIds: ["channel-a", " ", "channel-a"] }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse<{
      subscribedChannelIds: string[];
    }>();

    const handled = await handleDiscordLocalRoute(
      req,
      res,
      "/api/discord-local/subscriptions",
      "POST",
      state,
      helpers,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(subscribeChannelMessages).toHaveBeenCalledWith(["channel-a"]);
    expect(getJson().subscribedChannelIds).toEqual(["channel-a"]);
    expect(
      (
        state.config.connectors?.discordLocal as {
          messageChannelIds?: string[];
        }
      ).messageChannelIds,
    ).toEqual(["channel-a"]);
    expect(state.saveConfig).toHaveBeenCalledOnce();
  });
});
