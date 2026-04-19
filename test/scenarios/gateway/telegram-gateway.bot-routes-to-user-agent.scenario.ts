import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram-gateway.bot-routes-to-user-agent",
  title: "Telegram gateway bot routes DM to user's agent",
  domain: "gateway",
  tags: [
    "gateway",
    "telegram",
    "cross-platform-inconsistency-edge",
    "not-yet-implemented",
  ],
  description:
    "A shared Telegram bot receives a DM and routes it to the specific user's agent. Requires T5c (Telegram gateway bot with per-user routing).",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      channelType: "DM",
      title: "Telegram Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "telegram-inbound",
      room: "main",
      text: "Hey agent, this DM came through the Telegram gateway bot.",
      responseIncludesAny: ["Telegram", "got", "message", "routed"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-gateway-route-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5c (Telegram gateway bot + per-user agent routing).",
    },
  ],
});
