import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord.local.read-recent",
  title: "Read recent Discord DMs via local plugin",
  domain: "messaging.discord-local",
  tags: ["messaging", "discord", "happy-path", "smoke"],
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
      title: "Discord Local Read",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read discord dms",
      room: "main",
      text: "What's in my Discord DMs?",
      responseIncludesAny: ["discord", "dm", "message"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "discord-local-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5b (plugin-discord local integration in new schema surface)",
    },
  ],
});
