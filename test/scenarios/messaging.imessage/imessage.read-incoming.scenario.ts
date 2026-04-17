import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "imessage.read-incoming",
  title: "Read incoming iMessage threads",
  domain: "messaging.imessage",
  tags: ["messaging", "imessage", "happy-path", "smoke"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
    os: "macos",
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "iMessage Read Incoming",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read imessage",
      room: "main",
      text: "Any new iMessages I should know about?",
      responseIncludesAny: ["imessage", "message", "text"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "imessage-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5e (BlueBubbles iMessage integration wiring)",
    },
  ],
});
