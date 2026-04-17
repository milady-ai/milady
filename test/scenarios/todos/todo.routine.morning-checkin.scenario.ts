import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "todo.routine.morning-checkin",
  title: "Morning check-in surfaces today's todos",
  domain: "todos",
  tags: ["lifeops", "todos", "smoke", "plugin-disabled"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Todos Morning Check-in",
    },
  ],
  seed: [
    {
      type: "todo",
      name: "Drink water",
      dueIso: "{{now+2h}}",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "morning-checkin",
      text: "Good morning, what should I do today?",
      responseIncludesAny: ["morning", "today", "drink water", "water"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "morning-checkin-engine-ready",
      predicate: async () => {
        throw new Error(
          "NotYetImplemented: morning check-in engine (T9f: Morning/night check-in routine engine, plan §6.23)",
        );
      },
    },
  ],
});
