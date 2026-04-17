import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.inbox.daily-brief-includes-unsent-drafts",
  title: "Daily brief includes unsent drafts still waiting for approval",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "drafts", "transcript-derived"],
  description:
    "Transcript-derived case: unsent drafts that still need sign-off appear in the assistant's daily brief.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Includes Unsent Drafts",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief-with-drafts",
      room: "main",
      text: "In the daily brief, also tell me which drafts still need my sign-off.",
      responseIncludesAny: ["draft", "sign-off", "approval", "brief", "unsent"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-daily-brief-includes-unsent-drafts-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: draft approval queue is not yet integrated into the executive-assistant daily brief surface.",
    },
  ],
});
