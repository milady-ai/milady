import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.schedule.travel-blackout-reschedule",
  title: "Bulk reschedule meetings during a travel or crisis blackout",
  domain: "executive-assistant",
  tags: ["executive-assistant", "calendar", "travel", "transcript-derived"],
  description:
    "Transcript-derived case: the user is stranded and asks to cancel or push a whole class of meetings.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Travel Blackout Reschedule",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "bulk-push-meetings",
      room: "main",
      text: "We're gonna cancel some stuff and push everything back until next month. All partnership meetings.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "GMAIL_ACTION",
        ],
        description: "bulk partnership reschedule",
        includesAny: ["cancel", "push", "next month", "partnership"],
      }),
      responseIncludesAny: [
        "cancel",
        "push",
        "partnership",
        "next month",
        "meetings",
      ],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["CALENDAR_ACTION", "CROSS_CHANNEL_SEND", "GMAIL_ACTION"],
    },
    {
      type: "custom",
      name: "ea-travel-blackout-reschedule-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "GMAIL_ACTION",
        ],
        description: "bulk partnership reschedule",
        includesAny: ["cancel", "push", "next month", "partnership"],
      }),
    },
  ],
});
