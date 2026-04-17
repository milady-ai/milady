import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "gmail.triage.unread",
  title: "Triage unread Gmail inbox",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "triage", "happy-path", "smoke"],
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
      title: "Gmail Triage Unread",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "triage unread",
      room: "main",
      text: "Triage my unread email",
      expectedActions: ["GMAIL_ACTION"],
      responseIncludesAny: ["unread", "inbox", "triage"],
    },
  ],
  finalChecks: [
    {
      type: "actionCalled",
      actionName: "GMAIL_ACTION",
      status: "success",
      minCount: 1,
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
