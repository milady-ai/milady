/**
 * Action-selection negative test: a casual greeting must not trigger any
 * side-effect action (message-send, task-create, follow-up schedule, contact
 * add). REPLY is allowed since it is the plain conversational response action.
 *
 * Scope: verifies the agent's action-selection pipeline, independent of any
 * particular plugin/domain.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross.negative.greeting-calls-no-action",
  title: "Casual greeting triggers REPLY only — no side-effect actions",
  domain: "cross-cutting",
  tags: ["cross-cutting", "negative", "critical", "happy-path"],
  description:
    "A plain 'good morning' greeting must not call SEND_MESSAGE, DRAFT_REPLY, SCHEDULE_FOLLOW_UP, CREATE_TASK, or any other side-effect action. The agent should respond conversationally via REPLY.",

  isolation: "per-scenario",

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-cutting: greeting",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "user-greeting",
      room: "main",
      text: "Hey, good morning!",
      forbiddenActions: [
        "SEND_MESSAGE",
        "DRAFT_REPLY",
        "SCHEDULE_FOLLOW_UP",
        "CREATE_TASK",
        "ADD_CONTACT",
        "BLOCK_WEBSITES",
        "BLOCK_APPS",
      ],
      assertResponse: (text: string) => {
        if (!text || text.trim().length === 0) {
          return "Expected a non-empty conversational response to a greeting";
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "actionCalled",
      actionName: "REPLY",
      minCount: 1,
    },
  ],
});
