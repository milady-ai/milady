import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.travel.book-after-approval",
  title: "Book travel only after explicit approval",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "approval", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant asks before booking flights and hotels, then executes once approved.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Book Travel After Approval",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "offer-booking",
      room: "main",
      text: "I can go ahead and start booking the flights and hotel today if that's good with you.",
      responseIncludesAny: [
        "book",
        "flights",
        "hotel",
        "good with you",
        "approve",
      ],
    },
    {
      kind: "message",
      name: "confirm-booking",
      room: "main",
      text: "Yes, go ahead and book it.",
      responseIncludesAny: ["book", "confirmed", "travel", "hotel", "flight"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-book-after-approval-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: approval-gated travel booking and itinerary sync are not yet wired through LifeOps as an end-to-end travel workflow.",
    },
  ],
});
