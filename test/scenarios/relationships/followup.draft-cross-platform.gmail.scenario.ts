/**
 * Cross-platform follow-up draft (Gmail): user asks to draft a follow-up
 * email to Alice. A DRAFT_REPLY action is not in the current catalog —
 * this is part of message triage v2 (T7d). NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "followup.draft-cross-platform.gmail",
  title: "Draft a follow-up email to a Rolodex contact",
  domain: "relationships",
  tags: ["lifeops", "relationships", "cross-platform"],
  description:
    "User asks the agent to draft a follow-up email to Alice via Gmail. Cross-platform draft (DRAFT_REPLY / DRAFT_FOLLOWUP) not yet in catalog.",

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
      title: "Relationships: gmail follow-up draft",
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
      name: "draft-gmail-followup",
      room: "main",
      text: "Draft a follow-up email to Alice.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "draft-gmail-nyi",
      predicate: async () =>
        "NotYetImplemented: message triage v2 (T7d) — cross-platform DRAFT_REPLY / DRAFT_FOLLOWUP action not yet in catalog for Gmail",
    },
  ],
});
