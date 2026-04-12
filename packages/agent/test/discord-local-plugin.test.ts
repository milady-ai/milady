import { describe, expect, it, vi } from "vitest";
import {
  DISCORD_LOCAL_SERVICE_NAME,
  DiscordLocalService,
} from "../src/runtime/discord-local-plugin";

function createRuntime() {
  const settings: Record<string, string> = {
    DISCORD_LOCAL_CLIENT_ID: "discord-client-id",
    DISCORD_LOCAL_CLIENT_SECRET: "discord-client-secret",
    DISCORD_LOCAL_ENABLED: "true",
  };

  return {
    agentId: "agent-test",
    getSetting: vi.fn((key: string) => settings[key]),
    registerSendHandler: vi.fn(),
  } as unknown;
}

describe("DiscordLocalService.subscribeChannelMessages", () => {
  it("unsubscribes channels removed from the selection before subscribing new ones", async () => {
    const service = new DiscordLocalService(createRuntime() as never);
    const sendRpcCommand = vi.fn(async () => ({}));

    (
      service as unknown as {
        ensureAuthenticated: () => Promise<void>;
        sendRpcCommand: typeof sendRpcCommand;
        subscribedChannelIds: Set<string>;
      }
    ).ensureAuthenticated = vi.fn(async () => {});
    (
      service as unknown as {
        ensureAuthenticated: () => Promise<void>;
        sendRpcCommand: typeof sendRpcCommand;
        subscribedChannelIds: Set<string>;
      }
    ).sendRpcCommand = sendRpcCommand;
    (
      service as unknown as {
        subscribedChannelIds: Set<string>;
      }
    ).subscribedChannelIds = new Set(["channel-old", "channel-keep"]);

    const subscribed = await service.subscribeChannelMessages([
      "channel-keep",
      "channel-new",
    ]);

    expect(sendRpcCommand).toHaveBeenNthCalledWith(
      1,
      "UNSUBSCRIBE",
      { channel_id: "channel-old" },
      "MESSAGE_CREATE",
    );
    expect(sendRpcCommand).toHaveBeenNthCalledWith(
      2,
      "SUBSCRIBE",
      { channel_id: "channel-new" },
      "MESSAGE_CREATE",
    );
    expect(subscribed).toEqual(["channel-keep", "channel-new"]);
  });

  it("registers outbound send handlers that drive UI automation and persist the sent memory", async () => {
    const handlers = new Map<
      string,
      (
        runtime: unknown,
        target: { roomId?: string | null; channelId?: string | null },
        content: { text?: string | null },
      ) => Promise<void>
    >();
    const runtime = {
      ...(createRuntime() as Record<string, unknown>),
      registerSendHandler: vi.fn((source: string, handler: unknown) => {
        handlers.set(
          source,
          handler as (
            runtime: unknown,
            target: { roomId?: string | null; channelId?: string | null },
            content: { text?: string | null },
          ) => Promise<void>,
        );
      }),
      getRoom: vi.fn(async () => ({ channelId: "channel-1" })),
      createMemory: vi.fn(async () => {}),
    };
    const service = new DiscordLocalService(runtime as never);
    const sendUiMessage = vi.fn(async () => {});
    const getChannel = vi.fn(async () => ({
      id: "channel-1",
      guild_id: "guild-1",
    }));

    (
      service as unknown as {
        sendUiMessage: typeof sendUiMessage;
        getChannel: typeof getChannel;
      }
    ).sendUiMessage = sendUiMessage;
    (
      service as unknown as {
        sendUiMessage: typeof sendUiMessage;
        getChannel: typeof getChannel;
      }
    ).getChannel = getChannel;

    DiscordLocalService.registerSendHandlers(runtime as never, service);

    expect(handlers.has(DISCORD_LOCAL_SERVICE_NAME)).toBe(true);
    expect(handlers.has("discord")).toBe(true);

    await handlers.get(DISCORD_LOCAL_SERVICE_NAME)?.(
      runtime,
      { roomId: "room-1" },
      { text: "Hello from Milady" },
    );

    expect(sendUiMessage).toHaveBeenCalledWith(
      "channel-1",
      "guild-1",
      "Hello from Milady",
    );
    expect(runtime.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        content: expect.objectContaining({
          text: "Hello from Milady",
          source: DISCORD_LOCAL_SERVICE_NAME,
        }),
      }),
      "messages",
    );
  });
});
