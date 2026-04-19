/**
 * Track progress on a seeded relationship goal. Requires Rolodex-backed
 * per-contact relationship goals and interaction history (T7b, plan
 * §6.3/§6.4). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.relationship.track-progress",
  title: "Track progress on a relationship goal",
  domain: "goals",
  tags: ["lifeops", "goals", "relationships", "plugin-disabled"],
  description:
    "Seed a relationship goal and ask for progress. Requires T7b: Rolodex relationship goals + interaction history.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Relationship Goal Progress",
    },
  ],
  seed: [
    {
      type: "contact",
      name: "Mom",
      handles: [{ platform: "phone", identifier: "+15555551111" }],
      notes: "Parent",
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "relationship_goal",
        title: "Stay in closer touch with family",
        cadencePerWeek: 1,
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "contact_interaction",
        contactName: "Mom",
        channel: "phone",
        atIso: "{{now-5d}}",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "progress-query",
      text: "How am I doing on my family relationship goal this week?",
      responseIncludesAny: ["family", "mom", "goal", "week"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "relationship-goal-progress-nyi",
      predicate: async () =>
        "NotYetImplemented: Rolodex relationship-goal progress (T7b, plan §6.3/§6.4) — per-contact goal progress reporting not yet implemented",
    },
  ],
});
