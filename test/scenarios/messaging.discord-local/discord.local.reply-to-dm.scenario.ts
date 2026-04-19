import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord.local.reply-to-dm",
  title: "Reply to Discord DM with confirmation",
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
      title: "Discord Local Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft reply",
      room: "main",
      text: "Draft a reply to the latest Discord DM from Bob saying I'll be there soon.",
      forbiddenActions: ["SEND_MESSAGE"],
      responseIncludesAny: ["draft", "bob", "reply"],
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
      name: "discord-local-reply-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5b (plugin-discord local integration in new schema surface)",
    },
  ],
});
