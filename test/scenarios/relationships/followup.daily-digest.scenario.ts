/**
 * Follow-up daily digest: morning check-in surfaces overdue follow-ups
 * as part of the digest. Requires follow-up tracker service (T7c)
 * plus morning-digest integration. NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

export default scenario({
  id: "followup.daily-digest",
  title: "Morning digest surfaces overdue follow-ups",
  domain: "relationships",
  tags: ["lifeops", "relationships", "time-of-day"],
  description:
    "User asks for their morning digest. Agent should include overdue relationships. Requires follow-up tracker service (T7c).",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: daily digest",
    },
  ],

  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Fiona Gale",
        lastContactedAt: new Date(now - 45 * DAY_MS).toISOString(),
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Greg Howe",
        lastContactedAt: new Date(now - 21 * DAY_MS).toISOString(),
      },
    },
  ],

  turns: [
    {
      kind: "message",
      name: "morning-digest",
      room: "main",
      text: "What's on my plate this morning? Give me the daily digest.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "followup-digest-nyi",
      predicate: async () =>
        "NotYetImplemented: follow-up tracker service (T7c) — daily digest integration with overdue follow-ups not yet wired into morning check-in",
    },
  ],
});
