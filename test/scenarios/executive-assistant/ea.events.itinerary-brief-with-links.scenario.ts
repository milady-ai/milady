import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.events.itinerary-brief-with-links",
  title: "Build an event-day itinerary brief with links and times",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: push an itinerary with event locations, time slots, attendees, and links.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Itinerary Brief With Links",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-itinerary",
      room: "main",
      text: "Give me today's itinerary with all the event links, locations, and time slots.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["CALENDAR_ACTION", "DOSSIER"],
        description: "event itinerary briefing",
        includesAny: ["itinerary", "links", "location", "time"],
      }),
      responseIncludesAny: ["itinerary", "links", "locations", "time", "today"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["CALENDAR_ACTION", "DOSSIER"],
    },
    {
      type: "custom",
      name: "ea-itinerary-brief-with-links-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["CALENDAR_ACTION", "DOSSIER"],
        description: "event itinerary briefing",
        includesAny: ["itinerary", "links", "location", "time"],
      }),
    },
  ],
});
