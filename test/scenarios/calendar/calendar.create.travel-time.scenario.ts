import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.create.travel-time",
  title: "Create a calendar event with travel-time awareness",
  domain: "calendar",
  tags: ["lifeops", "calendar", "not-yet-implemented"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Calendar Create With Travel Time",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-event-with-travel-time",
      text: "Book a lunch with Alex at Tartine tomorrow at noon. Block travel time from my house.",
      responseIncludesAny: ["travel", "tartine", "noon", "alex", "lunch"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "calendar-travel-time-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8a (travel-time awareness)",
    },
  ],
});
