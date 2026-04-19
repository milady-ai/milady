import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "todo.forceful-reminder.morning-routine",
  title: "Morning routine pushes several overdue todos forcefully",
  domain: "todos",
  tags: ["lifeops", "todos", "plugin-disabled"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Todos Forceful Morning Routine",
    },
  ],
  seed: [
    {
      type: "todo",
      name: "Brush teeth",
      dueIso: "{{now-30m}}",
      isUrgent: true,
    },
    {
      type: "todo",
      name: "Stretch",
      dueIso: "{{now-45m}}",
      isUrgent: true,
    },
    {
      type: "todo",
      name: "Take vitamins",
      dueIso: "{{now-1h}}",
      isUrgent: true,
    },
  ],
  turns: [
    {
      kind: "message",
      name: "morning-routine-push",
      text: "Good morning.",
      responseJudge: {
        rubric:
          "Agent names multiple overdue morning-routine items (brush teeth, stretch, take vitamins) and presses the user to complete them.",
        minimumScore: 0.6,
      },
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "morning-routine-engine-ready",
      predicate: async () => {
        throw new Error(
          "NotYetImplemented: morning-routine forceful reminder engine (T9f: Morning/night check-in routine engine, plan §6.23)",
        );
      },
    },
  ],
});
