/**
 * Per-site social-media activity query, driven by the browser
 * extension (T8e) feeding per-origin data into the activity tracker
 * (T8d).
 *
 * NotYetImplemented until T8d + T8e.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_TIME_ON_SITE", "GET_ACTIVITY_REPORT"];

export default scenario({
  id: "activity.per-site.social",
  title: "Per-site social activity (requires browser extension)",
  domain: "activity",
  tags: ["activity", "browser", "happy-path"],
  description:
    "User asks which social sites took the most time. Requires T8d + T8e.",

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
      title: "Activity: per-site social",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "per-site-social-query",
      room: "main",
      text: "Which social sites did I spend the most time on this week?",
      responseIncludesAny: [/social/i, /site/i, /time|minutes|hours/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no per-site action fired — see tasks T8d + T8e.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "per-site-social-feasible",
      predicate: async () => {
        return "NotYetImplemented: per-site social activity requires T8d (activity tracker) + T8e (browser extension).";
      },
    },
  ],
});
