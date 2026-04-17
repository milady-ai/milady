/**
 * Set a relationship goal: user states a per-contact goal ("stay in
 * touch quarterly"). Requires Rolodex core service extension (T7b)
 * — per-contact goals and status fields. NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "relationships.status-goals.set",
  title: "Set a relationship goal for a contact",
  domain: "relationships",
  tags: ["lifeops", "relationships", "happy-path"],
  description:
    "User declares a relationship goal for Alice. Requires Rolodex core service extension (T7b).",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: set goal",
    },
  ],

  seed: [
    {
      type: "contact",
      name: "Alice Chen",
      handles: [{ platform: "gmail", identifier: "alice@acme.example.com" }],
      notes: "Acme Inc",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "set-relationship-goal",
      room: "main",
      text: "My relationship goal with Alice is: stay in touch quarterly.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "relationship-goal-set-nyi",
      predicate: async () =>
        "NotYetImplemented: Rolodex core service extension (T7b) — per-contact relationship-goal storage and SET_RELATIONSHIP_GOAL action not yet implemented",
    },
  ],
});
