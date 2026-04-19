import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.dossier.prep-briefing",
  title: "Agent generates a meeting prep dossier for an upcoming event",
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
      title: "LifeOps Calendar Dossier Prep",
    },
  ],
  seed: [
    {
      type: "calendarEvent",
      account: "test-owner",
      title: "3pm meeting with Alex",
      startIso: "{{now+3h}}",
      endIso: "{{now+3h}}",
      attendees: ["alex@example.com"],
    },
  ],
  turns: [
    {
      kind: "message",
      name: "ask-dossier",
      text: "Give me the dossier for my 3pm meeting.",
      responseIncludesAny: ["alex", "dossier", "brief", "meeting", "3pm"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "meeting-dossier-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7f (meeting dossiers)",
    },
  ],
});
