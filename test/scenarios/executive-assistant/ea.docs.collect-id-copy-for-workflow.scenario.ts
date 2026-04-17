import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.docs.collect-id-copy-for-workflow",
  title: "Collect a missing ID copy or artifact to unblock a workflow",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "identity", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant requests an updated ID copy because the one on file is expired.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Collect ID Copy",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-id-copy",
      room: "main",
      text: "If the only ID on file is expired, ask me for an updated copy so the workflow can continue.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "PUBLISH_DEVICE_INTENT",
          "CALL_USER",
          "CROSS_CHANNEL_SEND",
          "INBOX",
        ],
        description: "expired ID workflow escalation",
        includesAny: ["id", "expired", "workflow", "copy"],
      }),
      responseIncludesAny: [
        "ID",
        "expired",
        "updated copy",
        "workflow",
        "continue",
      ],
    },
  ],
  finalChecks: [
    {
      type: "interventionRequestExists",
      expected: true,
    },
    {
      type: "custom",
      name: "ea-collect-id-copy-for-workflow-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "PUBLISH_DEVICE_INTENT",
          "CALL_USER",
          "CROSS_CHANNEL_SEND",
          "INBOX",
        ],
        description: "expired ID workflow escalation",
        includesAny: ["id", "expired", "workflow", "copy"],
      }),
    },
  ],
});
