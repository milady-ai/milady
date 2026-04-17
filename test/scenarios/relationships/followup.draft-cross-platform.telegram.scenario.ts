/**
 * Cross-platform follow-up draft (Telegram): user asks to draft a
 * Telegram message to Alice. DRAFT_REPLY not yet in catalog for
 * Telegram — part of message triage v2 (T7d). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "followup.draft-cross-platform.telegram",
  title: "Draft a follow-up Telegram DM to a Rolodex contact",
  domain: "relationships",
  tags: ["lifeops", "relationships", "cross-platform"],
  description:
    "User asks the agent to draft a follow-up Telegram message to Alice. Cross-platform draft action not yet in catalog.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: telegram follow-up draft",
    },
  ],

  seed: [
    {
      type: "contact",
      name: "Alice Chen",
      handles: [{ platform: "telegram", identifier: "@alicechen" }],
      notes: "Acme Inc",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "draft-telegram-followup",
      room: "main",
      text: "Draft a follow-up Telegram message to Alice.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "draft-telegram-nyi",
      predicate: async () =>
        "NotYetImplemented: message triage v2 (T7d) — cross-platform DRAFT_REPLY / DRAFT_FOLLOWUP action not yet in catalog for Telegram",
    },
  ],
});
