import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.read-unread",
  title: "Read unread Twitter DMs",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "happy-path", "smoke"],
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
      title: "Twitter DM Read",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read twitter dms",
      room: "main",
      text: "Any unread DMs on Twitter?",
      responseIncludesAny: ["twitter", "dm", "unread"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8g (Twitter feed summarization + DM read/send)",
    },
  ],
});
