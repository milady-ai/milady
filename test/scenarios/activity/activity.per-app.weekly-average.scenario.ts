/**
 * Weekly average per-app usage. Requires durable persistence of
 * activity events across a 7-day window in T8d.
 *
 * NotYetImplemented until T8d.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_ACTIVITY_REPORT", "GET_TIME_ON_SITE"];

export default scenario({
  id: "activity.per-app.weekly-average",
  title: "Weekly per-app average usage",
  domain: "activity",
  tags: ["activity", "happy-path"],
  description:
    "User asks for a weekly per-app average. NotYetImplemented until T8d.",

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
      title: "Activity: weekly average",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "weekly-avg-query",
      room: "main",
      text: "What's my weekly average per app?",
      responseIncludesAny: [/week|weekly/i, /average|avg/i, /app/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no activity report action fired — see task T8d.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "weekly-avg-feasible",
      predicate: async () => {
        return "NotYetImplemented: weekly per-app averages require T8d (activity tracker) with 7-day persistence.";
      },
    },
  ],
});
