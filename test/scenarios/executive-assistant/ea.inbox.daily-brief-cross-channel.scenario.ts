import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.inbox.daily-brief-cross-channel",
  title: "Build a daily brief across channels, meetings, and actions",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "messaging", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant produces a structured daily brief with actions, reminders, and channel-specific inbox summaries.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Cross Channel",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief",
      room: "main",
      text: "Give me the daily brief with actions first, then reminders, then unread messages across channels.",
      responseIncludesAny: [
        "actions",
        "reminders",
        "unread",
        "brief",
        "channels",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-daily-brief-cross-channel-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: structured executive-assistant daily briefs across inbox, reminders, calendar, and actions are not yet wired as one composed output.",
    },
  ],
});
