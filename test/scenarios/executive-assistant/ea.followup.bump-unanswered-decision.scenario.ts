import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.followup.bump-unanswered-decision",
  title: "Bump an unanswered decision that is blocking other people",
  domain: "executive-assistant",
  tags: ["executive-assistant", "followup", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant keeps bumping a scheduling or event decision until it is resolved.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Bump Unanswered Decision",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-bump-policy",
      room: "main",
      text: "If I still haven't answered about those three events, bump me again with context instead of starting over.",
      responseIncludesAny: ["bump", "again", "context", "events", "follow up"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-bump-unanswered-decision-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: pending-decision nudging with preserved context is not yet fully wired into the executive-assistant follow-up loop.",
    },
  ],
});
