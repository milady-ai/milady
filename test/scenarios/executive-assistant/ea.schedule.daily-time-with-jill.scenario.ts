import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.schedule.daily-time-with-jill",
  title: "Reserve recurring daily time with Jill",
  domain: "executive-assistant",
  tags: [
    "executive-assistant",
    "calendar",
    "relationships",
    "transcript-derived",
  ],
  description:
    "Transcript-derived case: create a recurring daily decompression block with Jill before bed.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Schedule Daily Time With Jill",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-jill-time-block",
      room: "main",
      text: "Need to book 1 hour per day for time with Jill. Any time is fine, ideally before sleep.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["CALENDAR_ACTION", "PROPOSE_MEETING_TIMES"],
        description: "recurring Jill time block",
        includesAny: ["jill", "daily", "hour", "sleep"],
      }),
      responseIncludesAny: ["Jill", "hour", "daily", "before bed", "schedule"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["CALENDAR_ACTION", "PROPOSE_MEETING_TIMES"],
    },
    {
      type: "custom",
      name: "ea-daily-jill-time-block-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["CALENDAR_ACTION", "PROPOSE_MEETING_TIMES"],
        description: "recurring Jill time block",
        includesAny: ["jill", "daily", "hour", "sleep"],
      }),
    },
  ],
});
