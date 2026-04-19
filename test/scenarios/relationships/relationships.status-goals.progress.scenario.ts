/**
 * Check relationship progress: user asks how it's going with Alice.
 * Requires Rolodex core service extension (T7b) — progress reporting
 * against per-contact goals. NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

export default scenario({
  id: "relationships.status-goals.progress",
  title: "Check progress against a relationship goal",
  domain: "relationships",
  tags: ["lifeops", "relationships", "time-of-day"],
  description:
    "User asks how the relationship with Alice is going. Requires Rolodex core service extension (T7b).",

  status: "pending",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: goal progress",
    },
  ],

  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Alice Chen",
        relationshipGoal: "stay in touch quarterly",
        lastContactedAt: new Date(now - 100 * DAY_MS).toISOString(),
      },
    },
  ],

  turns: [
    {
      kind: "message",
      name: "progress-query",
      room: "main",
      text: "How's my relationship with Alice going?",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "relationship-progress-nyi",
      predicate: async () =>
        "NotYetImplemented: Rolodex core service extension (T7b) — relationship goal progress reporting and GET_RELATIONSHIP_PROGRESS action not yet implemented",
    },
  ],
});
