/**
 * Daily screen-time summary. User asks for a daily report; the agent
 * should call the activity tracker service to aggregate total usage
 * per app and per site and produce a human-readable summary.
 *
 * NotYetImplemented until T8d (activity tracker).
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_ACTIVITY_REPORT", "GET_TIME_ON_SITE"];

export default scenario({
  id: "lifeops-extension.daily-report",
  title: "Daily screen time report",
  domain: "browser.lifeops",
  tags: ["browser", "activity", "happy-path"],
  description:
    "User asks for a daily screen-time report. Agent should aggregate app + site time into a summary. NotYetImplemented until T8d.",

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
      title: "Browser extension: daily report",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "daily-report-request",
      room: "main",
      text: "Give me my daily screen time report.",
      responseIncludesAny: [/today/i, /total/i, /report/i, /screen time/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no GET_ACTIVITY_REPORT fired — see task T8d (activity tracker).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "daily-report-feasible",
      predicate: async () => {
        return "NotYetImplemented: daily report requires T8d (activity tracker) to be implemented.";
      },
    },
  ],
});
