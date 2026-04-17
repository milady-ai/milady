import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.travel.capture-booking-preferences",
  title: "Capture reusable flight and hotel preferences",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "preferences", "transcript-derived"],
  description:
    "Transcript-derived case: ask once for class, seat, luggage, hotel budget, distance tolerance, and trip extension preferences.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Capture Booking Preferences",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "capture-travel-preferences",
      room: "main",
      text: "Set up a list of my flight and hotel preferences so you don't have to ask every time.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["UPDATE_OWNER_PROFILE", "LIFE"],
        description: "travel preference capture",
        includesAny: ["flight", "hotel", "preferences", "every time"],
      }),
      responseIncludesAny: [
        "flight",
        "hotel",
        "preferences",
        "every time",
        "seat",
      ],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["UPDATE_OWNER_PROFILE", "LIFE"],
    },
    {
      type: "custom",
      name: "ea-capture-booking-preferences-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["UPDATE_OWNER_PROFILE", "LIFE"],
        description: "travel preference capture",
        includesAny: ["flight", "hotel", "preferences", "every time"],
      }),
    },
  ],
});
