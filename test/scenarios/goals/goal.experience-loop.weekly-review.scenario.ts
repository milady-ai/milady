/**
 * Weekly review via the experience loop. User asks for a review of the
 * week; expect the agent to synthesize goal progress, completed todos,
 * and wins. Requires check-in engine (T9f, plan §6.23) with weekly
 * review cadence. NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.experience-loop.weekly-review",
  title: "Weekly review synthesizes goal progress and wins",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "plugin-disabled"],
  description:
    "User asks 'review my week'. Requires T9f: check-in engine weekly review path.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Weekly Review",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal",
        title: "Lose 10 lbs by June",
        status: "active",
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "completed_task",
        title: "Shipped Milady v2 beta",
        atIso: "{{now-3d}}",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "weekly-review",
      text: "Review my week.",
      responseIncludesAny: ["week", "goal", "review", "wins"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "weekly-review-nyi",
      predicate: async () =>
        "NotYetImplemented: weekly review via check-in engine (T9f, plan §6.23) — weekly experience-loop synthesis not yet implemented",
    },
  ],
});
