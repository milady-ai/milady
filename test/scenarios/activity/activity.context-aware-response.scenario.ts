/**
 * Context-aware responses: the agent should know which app the user
 * is currently focused in and reference that in conversation without
 * the user telling it.
 *
 * NotYetImplemented until T8d (activity tracker) exposes a
 * current-focus activityProvider.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "activity.context-aware-response",
  title: "Agent references current app context",
  domain: "activity",
  tags: ["activity", "context", "happy-path"],
  description:
    "User asks a question that benefits from knowing what app they're in; the agent references it. NotYetImplemented until T8d exposes activityProvider.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Activity: context-aware",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "context-aware-query",
      room: "main",
      text: "What am I working on right now?",
      responseIncludesAny: [/app|window|focus|current/i],
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "context-aware-feasible",
      predicate: async () => {
        return "NotYetImplemented: current-app context requires T8d (activity tracker) activityProvider.";
      },
    },
  ],
});
