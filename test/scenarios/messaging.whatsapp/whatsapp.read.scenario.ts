import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "whatsapp.read",
  title: "Read recent WhatsApp messages",
  domain: "messaging.whatsapp",
  tags: ["messaging", "whatsapp", "happy-path", "smoke"],
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
      title: "WhatsApp Read",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read whatsapp",
      room: "main",
      text: "What's new on WhatsApp?",
      responseIncludesAny: ["whatsapp", "message", "chat"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "whatsapp-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5g (plugin-whatsapp integration in new schema surface)",
    },
  ],
});
