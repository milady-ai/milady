import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram.local.reply",
  title: "Reply to Telegram chat with confirmation",
  domain: "messaging.telegram-local",
  tags: ["messaging", "telegram", "confirmation"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Telegram Local Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft telegram reply",
      room: "main",
      text: "Reply to the last Telegram message from Carol saying I'm on my way.",
      forbiddenActions: ["SEND_MESSAGE"],
      responseIncludesAny: ["draft", "carol", "telegram"],
    },
    {
      kind: "message",
      name: "confirm send",
      room: "main",
      text: "Send it.",
      responseIncludesAny: ["sent", "sending", "send"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-local-reply-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5c (plugin-telegram local integration in new schema surface)",
    },
  ],
});
