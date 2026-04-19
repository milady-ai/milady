/**
 * X group chat as gateway to the agent. User asks agent to create or
 * join a group chat on X where the agent will be reachable, acting
 * as a cross-platform gateway (analogous to the Discord/Telegram
 * gateway adapters).
 *
 * NotYetImplemented until T8g (X integration) and T9g (cross-platform
 * gateway routing for X) land.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "x.dm.group-chat-gateway",
  title: "Create X group chat as gateway to agent",
  domain: "social.x",
  tags: ["social", "twitter", "gateway"],
  description:
    "User asks the agent to create a group chat on X that routes messages back to them through the agent. NotYetImplemented until T8g + T9g.",

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
      title: "Twitter: group gateway",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "group-gateway-request",
      room: "main",
      text: "Create an X group chat with me and the agent so I can message it there too.",
      responseIncludesAny: [/group/i, /x|twitter/i, /gateway|route|agent/i],
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "x-group-gateway-feasible",
      predicate: async () => {
        return "NotYetImplemented: X group-chat gateway requires T8g (X integration) + T9g (gateway routing).";
      },
    },
  ],
});
