import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.schedule.bundle-meetings-while-traveling",
  title: "Bundle related meetings while the user is briefly in a city",
  domain: "executive-assistant",
  tags: ["executive-assistant", "calendar", "travel", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant should combine nearby meetings while the user is temporarily in Tokyo.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Bundle Meetings While Traveling",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "bundle-city-meetings",
      room: "main",
      text: "I'm in Tokyo for limited time, so schedule PendingReality and Ryan at the same time if possible.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["PROPOSE_MEETING_TIMES", "CALENDAR_ACTION"],
        description: "city-limited meeting bundling",
        includesAny: [
          "tokyo",
          "same time",
          "schedule",
          "ryan",
          "pendingreality",
        ],
      }),
      responseIncludesAny: ["Tokyo", "Ryan", "same time", "bundle", "schedule"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["PROPOSE_MEETING_TIMES", "CALENDAR_ACTION"],
    },
    {
      type: "custom",
      name: "ea-bundle-meetings-while-traveling-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["PROPOSE_MEETING_TIMES", "CALENDAR_ACTION"],
        description: "city-limited meeting bundling",
        includesAny: [
          "tokyo",
          "same time",
          "schedule",
          "ryan",
          "pendingreality",
        ],
      }),
    },
  ],
});
