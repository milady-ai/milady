import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.followup.repair-missed-call-and-reschedule",
  title: "Repair a missed call and reschedule it quickly",
  domain: "executive-assistant",
  tags: ["executive-assistant", "followup", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the user missed a call and asks the assistant to repair the relationship and reschedule ASAP.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Repair Missed Call",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "repair-missed-call",
      room: "main",
      text: "I missed a call with the Frontier Tower guys today. Need to repair that and reschedule if possible asap.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "INBOX",
          "GMAIL_ACTION",
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
        ],
        description: "missed-call repair workflow",
        includesAny: ["repair", "reschedule", "call", "Frontier Tower"],
      }),
      responseIncludesAny: ["repair", "reschedule", "apology", "asap", "call"],
    },
  ],
  finalChecks: [
    {
      type: "draftExists",
      channel: "gmail",
      expected: true,
    },
    {
      type: "selectedAction",
      actionName: [
        "INBOX",
        "GMAIL_ACTION",
        "CALENDAR_ACTION",
        "CROSS_CHANNEL_SEND",
      ],
    },
    {
      type: "custom",
      name: "ea-repair-missed-call-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "INBOX",
          "GMAIL_ACTION",
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
        ],
        description: "missed-call repair workflow",
        includesAny: ["repair", "reschedule", "call", "Frontier Tower"],
      }),
    },
  ],
});
