/**
 * Twitter/X topic search. User asks for recent tweets about a topic.
 * Agent should call SEARCH_X (or similar) and return a concise
 * deep-dive summary of matches.
 *
 * NotYetImplemented until T8g.
 */

import { scenario } from "@elizaos/scenario-schema";

const X_SEARCH_ACTIONS = ["SEARCH_X", "FETCH_FEED_TOP", "SUMMARIZE_FEED"];

export default scenario({
  id: "x.search.topic-deep-dive",
  title: "Topic deep-dive search on X",
  domain: "social.x",
  tags: ["social", "twitter", "happy-path"],
  description:
    "User asks for recent tweets about elizaOS; agent returns a summary. NotYetImplemented until T8g.",

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
      title: "Twitter: topic search",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "topic-search-request",
      room: "main",
      text: "Find recent tweets about elizaOS.",
      responseIncludesAny: [/elizaos|eliza/i, /tweet/i, /recent/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          X_SEARCH_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no SEARCH_X fired — see task T8g (Twitter feed summarization).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "x-search-feasible",
      predicate: async () => {
        return "NotYetImplemented: X topic search requires T8g.";
      },
    },
  ],
});
