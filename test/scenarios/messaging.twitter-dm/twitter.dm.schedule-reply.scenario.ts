import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.schedule-reply",
  title: "Schedule a Twitter DM reply for later",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "time-of-day-edge"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter DM Schedule Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "schedule reply",
      room: "main",
      text: "Schedule a reply to @devfriend's Twitter DM for 9am tomorrow saying thanks for the intro.",
      responseIncludesAny: ["schedule", "9am", "tomorrow", "reply"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-schedule-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8g (Twitter feed summarization + DM read/send)",
    },
  ],
});
