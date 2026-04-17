import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.defend-time.overlap-refuses",
  title:
    "Agent refuses to schedule during a blackout and suggests alternatives",
  domain: "calendar",
  tags: ["lifeops", "calendar", "not-yet-implemented"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Calendar Defend Time Overlap Refuses",
    },
  ],
  seed: [
    {
      type: "calendarEvent",
      account: "test-owner",
      title: "Deep work blackout",
      startIso: "{{now+1d}}",
      endIso: "{{now+1d}}",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-during-blackout",
      text: "Schedule a meeting with Alex tomorrow at 10am.",
      responseIncludesAny: [
        "blackout",
        "deep work",
        "protect",
        "alternative",
        "instead",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "defend-time-overlap-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7e (scheduling-with-others defend time)",
    },
  ],
});
