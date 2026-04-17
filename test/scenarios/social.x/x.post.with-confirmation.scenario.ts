/**
 * Posting to X with confirmation. Turn 1: user says "post: shipped
 * Milady today". Agent drafts and asks to confirm — POST_TWEET must
 * NOT fire yet. Turn 2: user confirms; POST_TWEET fires.
 *
 * NotYetImplemented in the sense that the full gated post+confirm
 * path across T8g hasn't shipped; POST_TWEET itself exists (see
 * action-catalog).
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "x.post.with-confirmation",
  title: "Post tweet with explicit confirmation",
  domain: "social.x",
  tags: ["social", "twitter", "post", "confirmation"],
  description:
    "Turn 1: draft, no POST_TWEET. Turn 2: user confirms; POST_TWEET fires. NotYetImplemented until T8g wires the confirmation gate.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter: post+confirm",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "draft-post",
      room: "main",
      text: "Post: 'shipped Milady today 🎉'",
      forbiddenActions: ["POST_TWEET"],
      responseIncludesAny: [/confirm|sure|send|post it/i, /draft|preview/i],
    },
    {
      kind: "message",
      name: "confirm-post",
      room: "main",
      text: "Yes, post it.",
      responseIncludesAny: [/posted|posting|sent/i],
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "x-post-confirmation-wired",
      predicate: async () => {
        return "NotYetImplemented: X post + confirmation gating requires T8g (Twitter integration + confirmation flow).";
      },
    },
  ],
});
