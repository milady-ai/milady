/**
 * Quarterly review of a seeded career goal. Requires the morning/night
 * check-in routine engine extended to quarterly cadence (T9f, plan
 * §6.23). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.career.quarterly-review",
  title: "Quarterly review asks how Q1 went",
  domain: "goals",
  tags: ["lifeops", "goals", "career", "plugin-disabled"],
  description:
    "Seed a Q1 career goal and ask how Q1 went. Requires T9f: check-in engine extended to quarterly review.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Career Q1 Review",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal",
        title: "Q1: Launch Milady beta",
        quarter: "Q1",
        status: "active",
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal_progress",
        goalTitle: "Q1: Launch Milady beta",
        note: "Beta shipped in week 10",
        atIso: "{{now-14d}}",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "q1-review",
      text: "How did my Q1 go?",
      responseIncludesAny: ["Q1", "Milady", "beta", "goal"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "quarterly-review-nyi",
      predicate: async () =>
        "NotYetImplemented: quarterly review via check-in engine (T9f, plan §6.23) — quarterly goal review path not yet implemented",
    },
  ],
});
