import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "bluebubbles.imessage.send-blue",
  title: "Agent sends outbound iMessage (blue bubble) with confirmation",
  domain: "gateway",
  tags: [
    "gateway",
    "imessage",
    "bluebubbles",
    "confirms-destructive-edge",
    "not-yet-implemented",
  ],
  description:
    "Agent proposes sending an outbound iMessage to an Apple contact (blue bubble); after user confirmation, BlueBubbles delivers it. Requires T5e (BlueBubbles outbound send action).",
  status: "pending",
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
      title: "BlueBubbles iMessage Send Blue",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "propose-imessage",
      room: "main",
      text: "iMessage Sarah that I'll be there in 10 minutes.",
      responseIncludesAny: ["iMessage", "Sarah", "confirm", "10"],
    },
    {
      kind: "message",
      name: "confirm-imessage",
      room: "main",
      text: "Yes, send it.",
      responseIncludesAny: ["sent", "delivered", "iMessage"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "bluebubbles-send-blue-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5e (BlueBubbles outbound iMessage action + confirmation UX).",
    },
  ],
});
