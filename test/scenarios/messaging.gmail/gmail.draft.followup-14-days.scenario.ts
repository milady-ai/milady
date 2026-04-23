import { scenario } from "@elizaos/scenario-schema";
import {
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "gmail.draft.followup-14-days",
  title: "Identify 14-day-old email without a reply for follow-up",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "followup", "parameter-extraction"],
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
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
        description: "overdue Gmail follow-up scan",
        includesAny: ["follow", "reply", "overdue", "14"],
      }),
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must surface at least one overdue follow-up from email and make clear why it is overdue, such as no reply in roughly two weeks. A generic inbox summary without a follow-up recommendation fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "gmailActionArguments",
      actionName: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
      subaction: "unresponded",
    },
    {
      type: "gmailMockRequest",
      method: "GET",
      path: "/gmail/v1/users/me/threads",
      minCount: 1,
    },
    {
      type: "gmailNoRealWrite",
    },
    judgeRubric({
      name: "gmail-followup-tracker-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant identified the stale email follow-up instead of giving a generic Gmail summary.",
    }),
  ],
  cleanup: [
    {
      type: "gmailDeleteDrafts",
      account: "test-owner",
      tag: "milady-e2e",
    },
  ],
});
