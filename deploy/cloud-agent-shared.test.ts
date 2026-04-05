import { describe, expect, test } from "bun:test";
import { normalizeBridgeMessage } from "./cloud-agent-shared";

describe("normalizeBridgeMessage", () => {
  test("preserves managed Discord bridge identity and routing metadata", () => {
    expect(
      normalizeBridgeMessage({
        text: "hello there",
        roomId: "discord-guild:guild-1:channel:channel-1",
        channelType: "GROUP",
        source: "discord",
        sender: {
          id: "discord-user-1",
          username: "owner",
          displayName: "Owner Person",
          metadata: {
            discord: {
              userId: "discord-user-1",
              username: "owner",
            },
          },
        },
        metadata: {
          discord: {
            guildId: "guild-1",
            channelId: "channel-1",
          },
        },
      }),
    ).toEqual({
      text: "hello there",
      roomKey: "discord-guild:guild-1:channel:channel-1",
      mode: "power",
      channelType: "GROUP",
      source: "discord",
      sender: {
        id: "discord-user-1",
        username: "owner",
        displayName: "Owner Person",
        metadata: {
          discord: {
            userId: "discord-user-1",
            username: "owner",
          },
        },
      },
      metadata: {
        discord: {
          guildId: "guild-1",
          channelId: "channel-1",
        },
      },
    });
  });

  test("falls back to safe defaults when bridge params are missing", () => {
    expect(normalizeBridgeMessage({})).toEqual({
      text: "",
      roomKey: "default",
      mode: "power",
      channelType: "DM",
      source: "cloud-bridge",
    });
  });
});
