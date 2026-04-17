/**
 * Cross-platform follow-up draft (Discord): user asks to draft a DM to
 * Alice via Discord. DRAFT_REPLY action not yet in catalog for Discord
 * — part of message triage v2 (T7d). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "followup.draft-cross-platform.discord",
  title: "Draft a follow-up Discord DM to a Rolodex contact",
  domain: "relationships",
  tags: ["lifeops", "relationships", "cross-platform"],
  description:
    "User asks the agent to draft a follow-up Discord DM to Alice. Cross-platform draft action not yet in catalog.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: discord follow-up draft",
    },
  ],

  seed: [
    {
      type: "contact",
      name: "Alice Chen",
      handles: [{ platform: "discord", identifier: "alice#1234" }],
      notes: "Acme Inc",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "draft-discord-followup",
      room: "main",
      text: "Draft a follow-up Discord DM to Alice.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "draft-discord-nyi",
      predicate: async () =>
        "NotYetImplemented: message triage v2 (T7d) — cross-platform DRAFT_REPLY / DRAFT_FOLLOWUP action not yet in catalog for Discord",
    },
  ],
});
