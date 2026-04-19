import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "whatsapp.reply",
  title: "Reply to WhatsApp message with confirmation",
  domain: "messaging.whatsapp",
  tags: ["messaging", "whatsapp", "confirmation"],
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
      title: "WhatsApp Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft whatsapp reply",
      room: "main",
      text: "Reply on WhatsApp to Eve saying see you at 7.",
      forbiddenActions: ["SEND_MESSAGE"],
      responseIncludesAny: ["whatsapp", "eve", "draft"],
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
      name: "whatsapp-reply-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5g (plugin-whatsapp integration in new schema surface)",
    },
  ],
});
