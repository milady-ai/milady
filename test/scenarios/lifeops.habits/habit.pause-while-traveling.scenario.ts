/**
 * Pause morning habits while travelling. Exercises habit update for a
 * temporary pause window tied to a travel trip. Requires the check-in /
 * definition update flow to accept a pause-until directive end-to-end.
 *
 * NotYetImplemented → T9f (morning/night check-in engine + definition
 * pause directive).
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "habit.pause-while-traveling",
  title: "Pause morning habits while traveling until Saturday",
  domain: "habits",
  tags: ["lifeops", "habits", "cancel-mid-flow", "plugin-disabled"],
  description:
    "User asks to pause morning habits for a travel trip. Requires T9f: check-in engine + definition pause directive.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Pause While Traveling",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "habit_definition",
        title: "Morning stretch",
        cadenceKind: "daily",
        window: "morning",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "pause-request",
      text: "Pause my morning habits while I'm in Japan until Saturday.",
      responseIncludesAny: ["pause", "Japan", "Saturday", "travel"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "pause-while-traveling-nyi",
      predicate: async () =>
        "NotYetImplemented: habit pause directive via check-in engine (T9f, plan §6.23) — temporary pause window on definitions not yet wired up",
    },
  ],
});
