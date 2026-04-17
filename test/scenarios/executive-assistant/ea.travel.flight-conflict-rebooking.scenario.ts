import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.travel.flight-conflict-rebooking",
  title: "Detect a flight conflict and propose rebooking",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant warns about a conflict before a flight and offers to handle the rebooking.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Flight Conflict Rebooking",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "flight-conflict-warning",
      room: "main",
      text: "Flag the conflict before my flight later and, if needed, help rebook the other thing.",
      responseIncludesAny: ["flight", "conflict", "rebook", "later", "handle"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-flight-conflict-rebooking-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: pre-flight conflict detection plus coordinated rebooking is not yet a dedicated executive-assistant workflow.",
    },
  ],
});
