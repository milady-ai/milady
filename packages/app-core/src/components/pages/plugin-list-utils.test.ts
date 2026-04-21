import { describe, expect, it } from "vitest";
import type { PluginInfo } from "../../api";
import {
  buildDiscordInviteUrl,
  getPluginResourceLinks,
} from "./plugin-list-utils";

const baseDiscordPlugin = {
  id: "discord",
  name: "Discord",
  description: "Discord connector",
  enabled: false,
  configured: false,
  envKey: "DISCORD_API_TOKEN",
  category: "connector",
  source: "bundled",
  parameters: [
    {
      key: "DISCORD_API_TOKEN",
      type: "string",
      description: "Token",
      required: true,
      sensitive: true,
      currentValue: null,
      isSet: false,
    },
    {
      key: "DISCORD_APPLICATION_ID",
      type: "string",
      description: "Application ID",
      required: false,
      sensitive: false,
      currentValue: null,
      isSet: false,
    },
  ],
  validationErrors: [],
  validationWarnings: [],
  setupGuideUrl: "https://docs.elizaos.ai/plugin-registry/platform/discord",
} satisfies PluginInfo;

describe("plugin Discord resource links", () => {
  it("always exposes the Discord developer portal link", () => {
    const links = getPluginResourceLinks(baseDiscordPlugin);

    expect(links[0]).toEqual({
      key: "discord-developer-portal",
      url: "https://discord.com/developers/applications",
    });
  });

  it("builds a Discord invite link when the application ID is already configured", () => {
    const links = getPluginResourceLinks({
      ...baseDiscordPlugin,
      parameters: baseDiscordPlugin.parameters.map((param) =>
        param.key === "DISCORD_APPLICATION_ID"
          ? {
              ...param,
              currentValue: "123456789012345678",
              isSet: true,
            }
          : param,
      ),
    });

    expect(links).toContainEqual({
      key: "discord-invite",
      url: buildDiscordInviteUrl("123456789012345678"),
    });
  });

  it("prefers an unsaved draft application ID when building the invite link", () => {
    const links = getPluginResourceLinks(baseDiscordPlugin, {
      draftConfig: {
        DISCORD_APPLICATION_ID: "987654321098765432",
      },
    });

    expect(links).toContainEqual({
      key: "discord-invite",
      url: buildDiscordInviteUrl("987654321098765432"),
    });
  });

  it("does not expose an invite link for malformed application IDs", () => {
    const links = getPluginResourceLinks(baseDiscordPlugin, {
      draftConfig: {
        DISCORD_APPLICATION_ID: "discord-app-id",
      },
    });

    expect(links.some((link) => link.key === "discord-invite")).toBe(false);
  });
});
