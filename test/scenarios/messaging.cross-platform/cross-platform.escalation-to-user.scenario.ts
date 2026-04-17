import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.escalation-to-user",
  title: "Escalate to the user via gateway when agent cannot resolve alone",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "escalation"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-Platform Escalation",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "unresolvable request",
      room: "main",
      text: "Negotiate my apartment lease renewal with the landlord and sign it for me.",
      responseIncludesAny: ["escalate", "you", "confirm", "help"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-escalation-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9g (cross-device / gateway intent bus for escalation)",
    },
  ],
});
