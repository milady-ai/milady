/**
 * Missed-streak escalation: seed a habit with 3 missed-day memories and
 * expect the morning check-in to acknowledge the broken streak.
 *
 * Requires the morning/night check-in engine (T9f / plan §6.23) to
 * actually surface streak state during check-ins. NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "habit.missed-streak.escalation",
  title: "Morning check-in mentions broken habit streak",
  domain: "habits",
  tags: ["lifeops", "habits", "ambiguity", "plugin-disabled"],
  description:
    "Seed missed-day memories and expect the morning check-in to reference a broken streak. Requires T9f: morning/night check-in routine engine.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Missed Streak",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "habit_missed",
        habitTitle: "Stretch",
        missedAtIso: "{{now-3d}}",
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "habit_missed",
        habitTitle: "Stretch",
        missedAtIso: "{{now-2d}}",
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "habit_missed",
        habitTitle: "Stretch",
        missedAtIso: "{{now-1d}}",
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "morning-checkin",
      text: "Good morning, how am I doing on my habits?",
      responseIncludesAny: ["stretch", "streak", "missed", "back on track"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "missed-streak-escalation-nyi",
      predicate: async () =>
        "NotYetImplemented: morning/night check-in routine engine (T9f, plan §6.23) — broken-streak surfacing during check-in is not wired up",
    },
  ],
});
