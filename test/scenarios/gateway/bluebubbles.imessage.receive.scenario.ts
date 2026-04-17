import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "bluebubbles.imessage.receive",
  title: "Incoming iMessage routes to the agent via BlueBubbles",
  domain: "gateway",
  tags: [
    "gateway",
    "imessage",
    "bluebubbles",
    "cross-platform-inconsistency-edge",
    "not-yet-implemented",
  ],
  description:
    "Inbound iMessage hits the BlueBubbles bridge and is delivered to the user's agent. Requires T5e (BlueBubbles iMessage connector).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
    os: "macos",
  },
  rooms: [
    {
      id: "main",
      source: "bluebubbles",
      channelType: "DM",
      title: "BlueBubbles iMessage Receive",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "inbound-imessage",
      room: "main",
      text: "Hey, did you get my iMessage about the weekend plans?",
      responseIncludesAny: ["weekend", "iMessage", "got", "plans"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "bluebubbles-receive-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5e (BlueBubbles iMessage inbound connector + agent routing).",
    },
  ],
});
