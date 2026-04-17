import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.inbox.priority-ranks-urgent-before-low",
  title: "Rank urgent blockers ahead of low-priority noise",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "triage", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant should put urgent blockers first and demote low-value inbound.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Priority Briefing",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "priority-brief",
      room: "main",
      text: "Show me the urgent blockers first and separate them from low-priority inbound.",
      responseIncludesAny: [
        "urgent",
        "low priority",
        "blocker",
        "first",
        "inbound",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-priority-ranks-urgent-before-low-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: priority-ranked executive-assistant briefs are not yet deterministic across inbox, docs, and scheduling blockers.",
    },
  ],
});
