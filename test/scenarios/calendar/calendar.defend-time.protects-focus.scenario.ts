import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.defend-time.protects-focus",
  title: "Agent protects calendar focus blocks from meeting requests",
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
      title: "LifeOps Calendar Defend Time Focus",
    },
  ],
  seed: [
    {
      type: "calendarEvent",
      account: "test-owner",
      title: "Focus block",
      startIso: "{{now+1d}}",
      endIso: "{{now+1d}}",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-during-focus",
      text: "Add a 30-minute call with Sam tomorrow during my focus block.",
      responseIncludesAny: [
        "focus",
        "protect",
        "block",
        "alternative",
        "prefer",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "defend-time-protects-focus-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7e (scheduling-with-others defend focus)",
    },
  ],
});
