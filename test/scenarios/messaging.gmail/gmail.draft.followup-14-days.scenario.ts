import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "gmail.draft.followup-14-days",
  title: "Identify 14-day-old email without a reply for follow-up",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "followup", "parameter-extraction"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    credentials: ["gmail:test-owner"],
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Gmail Follow-up Tracker",
    },
  ],
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "followup-14-days-ago.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "find followups",
      room: "main",
      text: "Who haven't I followed up with?",
      responseIncludesAny: ["follow", "14", "day"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "gmail-followup-tracker-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7c (follow-up tracker service)",
    },
  ],
  cleanup: [
    {
      type: "gmailDeleteDrafts",
      account: "test-owner",
      tag: "milady-e2e",
    },
  ],
});
