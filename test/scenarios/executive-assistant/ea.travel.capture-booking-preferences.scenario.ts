import { scenario } from "@elizaos/scenario-schema";

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
      type: "custom",
      name: "ea-capture-booking-preferences-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: reusable travel preference capture exists in planning docs but is not yet implemented as durable assistant state.",
    },
  ],
});
