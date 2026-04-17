import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.daily-brief-cross-channel",
  title: "Build a daily brief across channels, meetings, and actions",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "messaging", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant produces a structured daily brief with actions, reminders, and channel-specific inbox summaries.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Cross Channel",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief",
      room: "main",
      text: "Give me the daily brief with actions first, then reminders, then unread messages across channels.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "CALENDAR_ACTION"],
        description: "cross-channel daily brief generation",
        includesAny: ["brief", "actions", "reminders", "unread"],
      }),
      responseIncludesAny: [
        "actions",
        "reminders",
        "unread",
        "brief",
        "channels",
      ],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "CALENDAR_ACTION"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["INBOX", "CALENDAR_ACTION"],
      includesAny: ["brief", "actions", "reminders", "unread"],
    },
    {
      type: "custom",
      name: "ea-daily-brief-cross-channel-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "CALENDAR_ACTION"],
        description: "cross-channel daily brief generation",
        includesAny: ["brief", "actions", "reminders", "unread"],
      }),
    },
  ],
});
