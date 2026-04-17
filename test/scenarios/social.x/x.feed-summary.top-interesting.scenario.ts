/**
 * Twitter/X feed summarization. User asks for the top 5 interesting
 * tweets in their feed today. The agent should call a
 * FETCH_FEED_TOP / SUMMARIZE_FEED action that returns tweet content
 * summaries without surfacing the user to X.
 *
 * NotYetImplemented until T8g (Twitter feed summarization).
 */

import { scenario } from "@elizaos/scenario-schema";

const X_FEED_ACTIONS = ["FETCH_FEED_TOP", "SUMMARIZE_FEED", "SEARCH_X"];

export default scenario({
  id: "x.feed-summary.top-interesting",
  title: "Summarize top 5 tweets in feed today",
  domain: "social.x",
  tags: ["social", "twitter", "smoke", "happy-path"],
  description:
    "User asks for a summary of the top 5 tweets in their feed today. NotYetImplemented until T8g.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter: feed summary",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "feed-summary-request",
      room: "main",
      text: "Summarize the top 5 tweets in my feed today.",
      responseIncludesAny: [/tweet/i, /feed/i, /top/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          X_FEED_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no FETCH_FEED_TOP / SUMMARIZE_FEED fired — see task T8g (Twitter feed summarization).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "x-feed-summary-feasible",
      predicate: async () => {
        return "NotYetImplemented: Twitter/X feed summarization requires T8g.";
      },
    },
  ],
});
