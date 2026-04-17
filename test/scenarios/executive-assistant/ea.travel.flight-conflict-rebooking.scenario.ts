import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.travel.flight-conflict-rebooking",
  title: "Detect a flight conflict and propose rebooking",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant warns about a conflict before a flight and offers to handle the rebooking.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Flight Conflict Rebooking",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "flight-conflict-warning",
      room: "main",
      text: "Flag the conflict before my flight later and, if needed, help rebook the other thing.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "flight conflict repair planning",
        includesAny: ["flight", "conflict", "rebook", "later"],
      }),
      responseIncludesAny: ["flight", "conflict", "rebook", "later", "handle"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["CALENDAR_ACTION", "CROSS_CHANNEL_SEND", "CALL_EXTERNAL"],
    },
    {
      type: "custom",
      name: "ea-flight-conflict-rebooking-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "flight conflict repair planning",
        includesAny: ["flight", "conflict", "rebook", "later"],
      }),
    },
  ],
});
