import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord.local.mute-channel",
  title: "Mute a Discord channel with confirmation",
  domain: "messaging.discord-local",
  tags: ["messaging", "discord", "confirmation"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Discord Local Mute",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mute gm channel",
      room: "main",
      text: "Mute the #gm channel",
      responseIncludesAny: ["mute", "gm", "channel"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "discord-local-mute-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5b (plugin-discord local integration in new schema surface)",
    },
  ],
});
