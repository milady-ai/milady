/**
 * Per-site time-tracking query via the (not-yet-built) LifeOps browser
 * extension backed by a WakaTime-like activity collector. The user asks
 * how much time they spent on a specific site today; the agent should
 * return a per-site breakdown via GET_TIME_ON_SITE (or equivalent
 * activity-provider action).
 *
 * Flagged NotYetImplemented via custom finalCheck until T8d (activity
 * tracker) and T8e (browser extension) land. See plan §4.9, §6.12, §6.13.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_TIME_ON_SITE", "GET_ACTIVITY_REPORT"];

export default scenario({
  id: "lifeops-extension.time-tracking.per-site",
  title: "Per-site time tracking query (twitter.com today)",
  domain: "browser.lifeops",
  tags: ["browser", "activity", "smoke", "happy-path"],
  description:
    "User asks 'How much time did I spend on twitter.com today?'. Requires the LifeOps browser extension to feed per-site data to the activity collector. NotYetImplemented until T8d + T8e.",

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
      title: "Browser extension: per-site time",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "per-site-time-query",
      room: "main",
      text: "How much time did I spend on twitter.com today?",
      responseIncludesAny: [/twitter/i, /minute/i, /hour/i, /time/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no GET_TIME_ON_SITE / GET_ACTIVITY_REPORT fired — see tasks T8d (activity tracker) and T8e (browser extension).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "activity-collector-available",
      predicate: async () => {
        return "NotYetImplemented: activity collector (T8d) and browser extension (T8e) are not implemented yet; per-site time tracking cannot be answered from real data.";
      },
    },
  ],
});
