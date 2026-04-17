/**
 * Multi-turn memory: the agent is told a fact, then asked about it on a
 * later turn. The response to turn 2 must recall the fact from turn 1.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross.multi-turn.memory-across-turns",
  title: "Agent recalls a user-stated fact on a later turn",
  domain: "cross-cutting",
  tags: ["cross-cutting", "multi-turn", "critical"],
  description:
    "Turn 1 tells the agent the user's favorite color. Turn 2 asks what it is. The agent's response must contain 'blue'.",

  isolation: "per-scenario",

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-cutting: memory across turns",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "state-fact",
      room: "main",
      text: "Remember: my favorite color is blue.",
    },
    {
      kind: "message",
      name: "recall-fact",
      room: "main",
      text: "What's my favorite color?",
      responseIncludesAny: ["blue", "Blue"],
    },
  ],

  finalChecks: [
    {
      type: "actionCalled",
      actionName: "REPLY",
      minCount: 2,
    },
  ],
});
