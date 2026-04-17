import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.calendar.meeting-dossier-before-event",
  title: "Generate a dossier before the next meeting or event",
  domain: "executive-assistant",
  tags: ["executive-assistant", "calendar", "briefing", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant should provide a prep dossier with people, context, and logistics before the meeting.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Meeting Dossier",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-dossier",
      room: "main",
      text: "Give me the dossier for my next meeting or event.",
      responseIncludesAny: ["dossier", "meeting", "event", "brief", "context"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-meeting-dossier-before-event-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: dossier generation exists as a planned surface but is not yet composed from contacts, inbox, and calendar context in executive-assistant mode.",
    },
  ],
});
