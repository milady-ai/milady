/**
 * Follow-up threshold check: specific 14-day threshold. One contact
 * crosses the threshold exactly, another is just below. Agent should
 * surface only the overdue one.
 *
 * Requires follow-up tracker service (T7c). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();

export default scenario({
  id: "followup.threshold-14-days",
  title: "Follow-up threshold of 14 days",
  domain: "relationships",
  tags: ["lifeops", "relationships", "time-of-day"],
  description:
    "Contacts cross a 14-day threshold. The agent should respect the rule. Requires follow-up tracker service (T7c).",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: 14-day follow-up threshold",
    },
  ],

  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Dana Park",
        followupThresholdDays: 14,
        lastContactedAt: new Date(now - 15 * DAY_MS).toISOString(),
      },
    },
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "contact",
        name: "Evan Holt",
        followupThresholdDays: 14,
        lastContactedAt: new Date(now - 10 * DAY_MS).toISOString(),
      },
    },
  ],

  turns: [
    {
      kind: "message",
      name: "check-14-day-threshold",
      room: "main",
      text: "Anyone I haven't talked to in over 14 days?",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "followup-threshold-nyi",
      predicate: async () =>
        "NotYetImplemented: follow-up tracker service (T7c) — per-contact followupThresholdDays rule evaluation not yet implemented",
    },
  ],
});
