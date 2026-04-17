import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "whatsapp-gateway.bot-routes-to-user-agent",
  title: "WhatsApp gateway bot routes DM to user's agent",
  domain: "gateway",
  tags: [
    "gateway",
    "whatsapp",
    "cross-platform-inconsistency-edge",
    "not-yet-implemented",
  ],
  description:
    "A shared WhatsApp bot receives a DM and routes it to the specific user's agent. Requires T5g (WhatsApp gateway bot with per-user routing).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "whatsapp",
      channelType: "DM",
      title: "WhatsApp Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "whatsapp-inbound",
      room: "main",
      text: "Hey agent, this DM came through the WhatsApp gateway bot.",
      responseIncludesAny: ["WhatsApp", "got", "message", "routed"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "whatsapp-gateway-route-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5g (WhatsApp gateway bot + per-user agent routing).",
    },
  ],
});
