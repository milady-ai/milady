import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "gmail.triage.high-priority-client",
  title: "Triage flags high-priority client email",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "triage", "parameter-extraction"],
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
      title: "Gmail Triage High-Priority",
    },
  ],
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "high-priority-client.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "triage high priority",
      room: "main",
      text: "Triage my inbox — anything I need to respond to right now?",
      responseIncludesAny: ["urgent", "high priority", "priority"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "gmail-high-priority-triage-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7d (message triage v2 cross-platform with priority flagging)",
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
