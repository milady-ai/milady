import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.docs.portal-upload-from-chat",
  title: "Upload a deck or asset to a portal from chat instructions",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "browser", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant takes a presentation asset from chat and uploads it to a speaker portal.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Portal Upload From Chat",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "portal-upload-request",
      room: "main",
      text: "When I send over the deck, upload it to the portal for me.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
        description: "portal upload task setup",
        includesAny: ["portal", "upload", "deck"],
      }),
      responseIncludesAny: ["deck", "upload", "portal", "send over", "for me"],
    },
  ],
  finalChecks: [
    {
      type: "browserTaskCompleted",
      expected: true,
    },
    {
      type: "uploadedAssetExists",
      expected: true,
    },
    {
      type: "custom",
      name: "ea-portal-upload-from-chat-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
        description: "portal upload task setup",
        includesAny: ["portal", "upload", "deck"],
      }),
    },
  ],
});
