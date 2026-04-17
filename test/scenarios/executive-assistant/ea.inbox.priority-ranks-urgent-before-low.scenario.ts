import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.priority-ranks-urgent-before-low",
  title: "Rank urgent blockers ahead of low-priority noise",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "triage", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant should put urgent blockers first and demote low-value inbound.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Priority Briefing",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "priority-brief",
      room: "main",
      text: "Show me the urgent blockers first and separate them from low-priority inbound.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "priority-ranked inbox brief",
        includesAny: ["urgent", "low", "priority", "blocker"],
      }),
      responseIncludesAny: [
        "urgent",
        "low priority",
        "blocker",
        "first",
        "inbound",
      ],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "GMAIL_ACTION"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["INBOX", "GMAIL_ACTION"],
      includesAny: ["urgent", "low", "priority", "blocker"],
    },
    {
      type: "custom",
      name: "ea-priority-ranks-urgent-before-low-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "priority-ranked inbox brief",
        includesAny: ["urgent", "low", "priority", "blocker"],
      }),
    },
  ],
});
