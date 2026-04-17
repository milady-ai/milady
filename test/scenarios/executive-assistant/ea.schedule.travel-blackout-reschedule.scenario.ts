import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.schedule.travel-blackout-reschedule",
  title: "Bulk reschedule meetings during a travel or crisis blackout",
  domain: "executive-assistant",
  tags: ["executive-assistant", "calendar", "travel", "transcript-derived"],
  description:
    "Transcript-derived case: the user is stranded and asks to cancel or push a whole class of meetings.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Travel Blackout Reschedule",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "bulk-push-meetings",
      room: "main",
      text: "We're gonna cancel some stuff and push everything back until next month. All partnership meetings.",
      responseIncludesAny: [
        "cancel",
        "push",
        "partnership",
        "next month",
        "meetings",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-travel-blackout-reschedule-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: bulk reschedule by meeting class plus linked outbound repair messaging is not yet a first-class executive-assistant flow.",
    },
  ],
});
