/**
 * Per-app usage query. User asks which apps they used most today.
 * Requires the WakaTime-like activity collector (T8d) hooked into
 * NSWorkspace (macOS) focus events.
 *
 * NotYetImplemented until T8d.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_ACTIVITY_REPORT", "GET_TIME_ON_SITE"];

export default scenario({
  id: "activity.per-app.today",
  title: "Per-app usage report for today",
  domain: "activity",
  tags: ["activity", "smoke", "happy-path"],
  description:
    "User asks 'Which apps did I use most today?'. NotYetImplemented until T8d (activity tracker).",

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
      title: "Activity: per-app today",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "per-app-today",
      room: "main",
      text: "Which apps did I use most today?",
      responseIncludesAny: [/app/i, /today/i, /time|minutes|hours/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no GET_ACTIVITY_REPORT fired — see task T8d.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "per-app-feasible",
      predicate: async () => {
        return "NotYetImplemented: per-app activity query requires T8d (activity tracker).";
      },
    },
  ],
});
