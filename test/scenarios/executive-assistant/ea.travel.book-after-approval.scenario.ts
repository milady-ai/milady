import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

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
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking proposal",
        includesAny: ["book", "flight", "hotel", "approve"],
      }),
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
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking confirmation",
        includesAny: ["book", "flight", "hotel", "confirm"],
      }),
      responseIncludesAny: ["book", "confirmed", "travel", "hotel", "flight"],
    },
  ],
  finalChecks: [
    {
      type: "approvalRequestExists",
      expected: true,
    },
    {
      type: "messageDelivered",
      channel: ["email", "sms"],
      expected: true,
    },
    {
      type: "custom",
      name: "ea-book-after-approval-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking proposal and confirmation",
        includesAny: ["book", "flight", "hotel", "confirm"],
        minCount: 1,
      }),
    },
  ],
});
