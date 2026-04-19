/**
 * Import contacts from a platform: user asks to import top Discord DM
 * partners into the Rolodex. Requires Rolodex core service extension
 * (T7b) — platform-import action (IMPORT_CONTACTS_FROM_PLATFORM).
 * NotYetImplemented.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "relationships.import-from-platform",
  title: "Import top DM partners from a platform into the Rolodex",
  domain: "relationships",
  tags: ["lifeops", "relationships", "cross-platform"],
  description:
    "User asks to import their top 20 Discord DM partners into the Rolodex. Requires Rolodex core service extension (T7b).",

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
      title: "Relationships: import from platform",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "import-discord-contacts",
      room: "main",
      text: "Import my top 20 Discord DM partners into my Rolodex.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "import-from-platform-nyi",
      predicate: async () =>
        "NotYetImplemented: Rolodex core service extension (T7b) — IMPORT_CONTACTS_FROM_PLATFORM action and per-platform top-partners fetch not yet implemented",
    },
  ],
});
