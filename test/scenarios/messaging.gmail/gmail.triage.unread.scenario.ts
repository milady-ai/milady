import { scenario } from "@elizaos/scenario-schema";
import { expectTurnToCallAction } from "../_helpers/action-assertions.ts";

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
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "unread-inbox.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "triage unread",
      room: "main",
      text: "Triage my unread email",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["GMAIL_ACTION"],
        description: "gmail unread triage",
        includesAny: ["triage", "unread"],
      }),
    },
  ],
  finalChecks: [
    {
      type: "gmailActionArguments",
      actionName: "GMAIL_ACTION",
      subaction: "triage",
    },
    {
      type: "gmailMockRequest",
      method: "GET",
      path: "/gmail/v1/users/me/messages",
      minCount: 1,
    },
    {
      type: "gmailNoRealWrite",
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
