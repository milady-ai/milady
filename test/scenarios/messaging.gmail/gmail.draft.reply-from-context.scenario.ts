import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "gmail.draft.reply-from-context",
  title: "Draft Gmail reply using recent email context",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "draft", "happy-path"],
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
      title: "Gmail Draft Reply",
    },
  ],
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "alice-recent.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft reply to alice",
      room: "main",
      text: "Draft a reply to Alice",
      responseIncludesAny: ["draft", "alice", "reply"],
    },
  ],
  finalChecks: [
    {
      type: "draftCount",
      account: "test-owner",
      delta: 1,
    },
    {
      type: "custom",
      name: "gmail-draft-adapter-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7d (Gmail draft adapter wiring for draftCount final check)",
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
