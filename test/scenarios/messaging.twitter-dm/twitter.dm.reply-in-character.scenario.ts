import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.reply-in-character",
  title: "Reply to Twitter DM in user's typical tone",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "parameter-extraction"],
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
      title: "Twitter DM Reply In Character",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft in character reply",
      room: "main",
      text: "Draft a reply to that Twitter DM from @milady_art in my usual tone.",
      forbiddenActions: ["SEND_MESSAGE"],
      responseJudge: {
        rubric:
          "Reply matches the user's typical tone (informal, lowercase, concise) and addresses the @milady_art DM context.",
        minimumScore: 0.7,
      },
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-reply-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8g (Twitter feed summarization + DM read/send)",
    },
  ],
});
