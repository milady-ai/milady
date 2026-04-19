import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram.local.mute-chat",
  title: "Mute a noisy Telegram chat",
  domain: "messaging.telegram-local",
  tags: ["messaging", "telegram", "confirmation"],
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
      title: "Telegram Local Mute",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mute chat",
      room: "main",
      text: "Mute the 'crypto signals' Telegram group for 24 hours.",
      responseIncludesAny: ["mute", "crypto", "telegram"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-local-mute-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5c (plugin-telegram local integration in new schema surface)",
    },
  ],
});
