/**
 * Track progress on a seeded health goal: seed a weight-loss goal and a
 * recent weigh-in memory, then ask for progress. Requires the check-in
 * engine (T9f, plan §6.23) to surface progress in chat.
 * NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.health.track-progress",
  title: "Track progress on a weight-loss goal",
  domain: "goals",
  tags: ["lifeops", "goals", "health", "plugin-disabled"],
  description:
    "Seed a health goal + a weigh-in memory and ask how things are going. Requires T9f: check-in engine progress surfacing.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Health Goal Progress",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal",
        title: "Lose 10 lbs by June",
        category: "health",
        startWeightLbs: 190,
        targetWeightLbs: 180,
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "health_weigh_in",
        weightLbs: 186,
        atIso: "{{now-2d}}",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "progress-query",
      text: "How am I doing on the weight loss goal?",
      responseIncludesAny: ["weight", "lbs", "progress", "186"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "health-goal-progress-nyi",
      predicate: async () =>
        "NotYetImplemented: health goal progress via check-in engine (T9f, plan §6.23) — weigh-in aggregation + progress reply not yet implemented",
    },
  ],
});
