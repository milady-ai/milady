/**
 * The "never visit X" requirement: the user should not be redirected
 * to x.com; the agent must surface relevant tweet content directly
 * in chat (links optional but content primary).
 *
 * NotYetImplemented until T8g.
 */

import { scenario } from "@elizaos/scenario-schema";

const X_FEED_ACTIONS = ["FETCH_FEED_TOP", "SUMMARIZE_FEED", "SEARCH_X"];

export default scenario({
  id: "x.never-visit.surface-content-in-chat",
  title: "Agent surfaces X content in chat without redirecting user",
  domain: "social.x",
  tags: ["social", "twitter", "happy-path"],
  description:
    "User should never be redirected to X; tweet content must appear in the response. NotYetImplemented until T8g.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter: never-visit",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "no-redirect-request",
      room: "main",
      text: "What are people saying about the latest OpenAI launch on X? Don't just send me a link — tell me here.",
      responseExcludes: [/go to x\.com/i, /open twitter/i, /visit x\.com/i],
      responseIncludesAny: [/tweet|said|posting|writing|thread/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          X_FEED_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no X feed action fired — see task T8g.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "never-visit-x-feasible",
      predicate: async () => {
        return "NotYetImplemented: inline X content surfacing requires T8g.";
      },
    },
  ],
});
