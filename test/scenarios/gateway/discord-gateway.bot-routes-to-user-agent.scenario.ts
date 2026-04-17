import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord-gateway.bot-routes-to-user-agent",
  title: "Discord gateway bot routes DM to user's agent",
  domain: "gateway",
  tags: [
    "gateway",
    "discord",
    "cross-platform-inconsistency-edge",
    "not-yet-implemented",
  ],
  description:
    "A shared Discord bot receives a DM and routes it to the specific user's agent. Requires T5b (Discord gateway bot with per-user routing).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "discord",
      channelType: "DM",
      title: "Discord Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "discord-inbound",
      room: "main",
      text: "Hey agent, this DM came through the Discord gateway bot.",
      responseIncludesAny: ["Discord", "got", "message", "routed"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "discord-gateway-route-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5b (Discord gateway bot + per-user agent routing).",
    },
  ],
});
