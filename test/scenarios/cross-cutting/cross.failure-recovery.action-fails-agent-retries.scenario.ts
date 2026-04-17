/**
 * Failure-recovery test: seed a corrupt todo memory row, then ask the
 * agent to show todos. The agent must respond gracefully — no uncaught
 * exception surfacing to the user, no raw stack traces in the response.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross.failure-recovery.action-fails-agent-retries",
  title: "Agent degrades gracefully when a todo memory row is corrupt",
  domain: "cross-cutting",
  tags: ["cross-cutting", "failure-recovery"],
  description:
    "A corrupt todo memory row is seeded. User asks for their todos. Agent must answer without leaking stack traces or 'undefined' into the response.",

  isolation: "per-scenario",

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-cutting: failure recovery",
    },
  ],

  seed: [
    {
      type: "memory",
      roomId: "main",
      content: {
        kind: "todo",
        status: "corrupt",
      },
    },
  ],

  turns: [
    {
      kind: "message",
      name: "show-todos",
      room: "main",
      text: "Show me my todos",
      responseJudge: {
        rubric:
          "Agent responds clearly about the todos, handling any data issues gracefully without exposing errors to the user.",
        minimumScore: 0.7,
      },
      assertResponse: (text) => {
        if (!text || text.trim().length === 0) {
          return "Expected a non-empty response";
        }
        if (/stacktrace|\bError:\s|TypeError|at\s+\w+\s+\(/i.test(text)) {
          return `Response leaked raw error / stack detail: ${text.slice(0, 200)}`;
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
