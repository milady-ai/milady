/**
 * Follow-up overdue tracker: three contacts seeded with varying
 * last-contacted-at timestamps. User asks who they should follow up with.
 *
 * The LIST_OVERDUE_FOLLOWUPS action and the follow-up tracker service
 * (T7c) are not yet implemented. This scenario intentionally reports
 * NotYetImplemented until that unit lands.
 */

import { scenario } from "@elizaos/scenario-schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

export default scenario({
  id: "followup.track-overdue",
  title: "Surface overdue follow-ups",
  domain: "relationships",
  tags: ["lifeops", "relationships", "time-of-day", "smoke"],
  description:
    "Three contacts have varying lastContactedAt values. The agent should surface the overdue ones. Requires follow-up tracker service (T7c).",

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
      title: "Relationships: overdue follow-ups",
    },
  ],

  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Alice Chen",
        lastContactedAt: new Date(now - 30 * DAY_MS).toISOString(),
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Bob Rivera",
        lastContactedAt: new Date(now - 3 * DAY_MS).toISOString(),
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Carol Patel",
        lastContactedAt: new Date(now - 60 * DAY_MS).toISOString(),
      },
    },
  ],

  turns: [
    {
      kind: "message",
      name: "who-to-followup",
      room: "main",
      text: "Who should I follow up with?",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "followup-tracker-nyi",
      predicate: async () =>
        "NotYetImplemented: follow-up tracker service (T7c) — LIST_OVERDUE_FOLLOWUPS action and reconciler cron not yet built",
    },
  ],
});
