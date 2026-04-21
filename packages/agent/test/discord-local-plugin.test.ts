import { describe, expect, it, vi } from "vitest";
import {
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
});
