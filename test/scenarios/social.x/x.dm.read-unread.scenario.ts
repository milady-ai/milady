/**
 * Reading unread Twitter/X DMs. Agent should fetch and summarize
 * unread DM threads without requiring the user to open X.
 *
 * NotYetImplemented until T8g.
 */

import { scenario } from "@elizaos/scenario-schema";

const X_DM_ACTIONS = ["FETCH_FEED_TOP", "SUMMARIZE_FEED", "SEARCH_X"];

export default scenario({
  id: "x.dm.read-unread",
  title: "Read unread Twitter/X DMs",
  domain: "social.x",
  tags: ["social", "twitter", "dm", "happy-path"],
  description:
    "User asks 'Any unread X DMs?'. Agent summarizes unread DMs without redirecting to X. NotYetImplemented until T8g.",

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
      title: "Twitter: DM read",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "unread-dm-query",
      room: "main",
      text: "Any unread X DMs?",
      responseIncludesAny: [/dm|message/i, /unread|new/i, /x|twitter/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          X_DM_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no X DM action fired — see task T8g.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "x-dm-read-feasible",
      predicate: async () => {
        return "NotYetImplemented: X DM reading requires T8g.";
      },
    },
  ],
});
