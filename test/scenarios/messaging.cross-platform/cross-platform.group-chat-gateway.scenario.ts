import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.group-chat-gateway",
  title: "Create a cross-platform group chat with agent and Alice on Discord",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "confirmation"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-Platform Group Chat Gateway",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create group chat",
      room: "main",
      text: "Create a group chat with the agent and Alice on Discord.",
      responseIncludesAny: ["group", "discord", "alice"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-group-chat-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9g (cross-device / gateway intent bus)",
    },
  ],
});
