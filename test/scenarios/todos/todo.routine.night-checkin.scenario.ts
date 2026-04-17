import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "todo.routine.night-checkin",
  title: "Night check-in reviews today's todos",
  domain: "todos",
  tags: ["lifeops", "todos", "plugin-disabled"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Todos Night Check-in",
    },
  ],
  seed: [
    {
      type: "todo",
      name: "Journal",
      dueIso: "{{now+1h}}",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "night-checkin",
      text: "Good night, how did today go?",
      responseIncludesAny: ["night", "today", "journal", "tomorrow"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "night-checkin-engine-ready",
      predicate: async () => {
        throw new Error(
          "NotYetImplemented: night check-in engine (T9f: Morning/night check-in routine engine, plan §6.23)",
        );
      },
    },
  ],
});
