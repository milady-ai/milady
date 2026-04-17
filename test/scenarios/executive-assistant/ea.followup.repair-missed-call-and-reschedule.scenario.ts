import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.followup.repair-missed-call-and-reschedule",
  title: "Repair a missed call and reschedule it quickly",
  domain: "executive-assistant",
  tags: ["executive-assistant", "followup", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the user missed a call and asks the assistant to repair the relationship and reschedule ASAP.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Repair Missed Call",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "repair-missed-call",
      room: "main",
      text: "I missed a call with the Frontier Tower guys today. Need to repair that and reschedule if possible asap.",
      responseIncludesAny: ["repair", "reschedule", "apology", "asap", "call"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-repair-missed-call-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: missed-commitment repair with apology drafting plus fast reschedule is not yet a dedicated executive-assistant workflow.",
    },
  ],
});
