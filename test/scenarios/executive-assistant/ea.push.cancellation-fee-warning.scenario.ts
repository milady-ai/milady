import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.push.cancellation-fee-warning",
  title: "Warn the user when missing something may incur a fee",
  domain: "executive-assistant",
  tags: ["executive-assistant", "push", "risk", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant warns the user that a late cancellation may cost money and offers to act immediately.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Cancellation Fee Warning",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "cancellation-fee-warning",
      room: "main",
      text: "If missing this could trigger a cancellation fee, warn me clearly and offer to handle it now.",
      responseIncludesAny: ["fee", "warn", "handle", "now", "cancellation"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-cancellation-fee-warning-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: explicit financial-risk escalation for appointments and events is not yet implemented as a first-class assistant handler.",
    },
  ],
});
