/**
 * Experience loop: agent learns from completed goals. Seed a completed
 * goal + its experience notes and expect the agent to surface what
 * worked next time a similar goal is proposed. Requires check-in engine
 * (T9f, plan §6.23) with experience-loop learning path.
 * NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.experience-loop.learn-from-completion",
  title: "Agent references prior completed goal when similar goal is proposed",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "plugin-disabled"],
  description:
    "Seed a completed goal + lessons. Propose a similar new goal and expect the agent to reference prior lessons. Requires T9f: experience-loop learning.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Experience Loop",
    },
  ],
  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal",
        title: "Lose 5 lbs last quarter",
        status: "completed",
        completedAtIso: "{{now-30d}}",
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        type: "goal_experience",
        goalTitle: "Lose 5 lbs last quarter",
        lessons: [
          "Sunday weigh-ins worked better than daily",
          "Cutting late-night snacks was the biggest lever",
        ],
      },
    },
  ],
  turns: [
    {
      kind: "message",
      name: "new-similar-goal",
      text: "I want a new goal to lose another 5 lbs this quarter.",
      responseIncludesAny: ["last time", "before", "worked", "lesson", "lbs"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "experience-loop-learn-nyi",
      predicate: async () =>
        "NotYetImplemented: experience-loop learning via check-in engine (T9f, plan §6.23) — retrieval of prior goal lessons on similar new goals not yet implemented",
    },
  ],
});
