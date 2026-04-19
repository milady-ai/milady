import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.scheduling-with-others.propose-times",
  title: "Agent proposes three available time slots for a meeting",
  domain: "calendar",
  tags: ["lifeops", "calendar", "not-yet-implemented"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Calendar Propose Times",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "propose-three-slots",
      text: "Give me three 30-minute slots I can offer Alex next week.",
      responseIncludesAny: ["three", "slot", "option", "1", "2", "3"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "scheduling-propose-times-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7e (scheduling-with-others propose slots)",
    },
  ],
});
