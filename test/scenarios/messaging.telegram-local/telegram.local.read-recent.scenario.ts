import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram.local.read-recent",
  title: "Read recent Telegram messages via local plugin",
  domain: "messaging.telegram-local",
  tags: ["messaging", "telegram", "happy-path", "smoke"],
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
      title: "Telegram Local Read",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read telegram",
      room: "main",
      text: "What's new on Telegram?",
      responseIncludesAny: ["telegram", "message", "chat"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-local-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5c (plugin-telegram local integration in new schema surface)",
    },
  ],
});
