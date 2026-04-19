/**
 * Social-media-focused time breakdown. User asks the agent to break
 * down their time across X, Instagram, Facebook, etc. Requires the
 * LifeOps browser extension (T8e) to emit per-origin events into the
 * activity collector (T8d) so the agent can aggregate by a
 * social-media bucket.
 *
 * NotYetImplemented until T8d + T8e.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_TIME_ON_SITE", "GET_ACTIVITY_REPORT"];

export default scenario({
  id: "lifeops-extension.time-tracking.social-breakdown",
  title: "Social-media time breakdown",
  domain: "browser.lifeops",
  tags: ["browser", "activity", "happy-path"],
  description:
    "User asks 'Break down my social media time today'. Agent should return a per-site split across X, Instagram, Facebook, etc. NotYetImplemented until T8d + T8e.",

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
      title: "Browser extension: social breakdown",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "social-breakdown-query",
      room: "main",
      text: "Break down my social media time today across X, Instagram, and Facebook.",
      responseIncludesAny: [/social/i, /breakdown/i, /twitter|x\.com/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no activity-provider action fired — see tasks T8d (activity tracker) and T8e (browser extension).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "social-breakdown-feasible",
      predicate: async () => {
        return "NotYetImplemented: social-media time breakdown requires per-site data from T8e (browser extension) feeding T8d (activity tracker).";
      },
    },
  ],
});
