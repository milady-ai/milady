import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.scheduling-with-others.ask-preferences",
  title: "Agent pulls user's preferred meeting times when asked",
  domain: "calendar",
  tags: ["lifeops", "calendar", "not-yet-implemented"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Calendar Ask Preferences",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "ask-what-times-to-offer",
      text: "What times should I offer for a meeting next week?",
      responseIncludesAny: ["prefer", "time", "morning", "afternoon", "block"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "scheduling-with-others-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7e (scheduling-with-others preferences)",
    },
  ],
});
