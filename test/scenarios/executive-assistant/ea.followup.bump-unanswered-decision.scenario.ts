import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.followup.bump-unanswered-decision",
  title: "Bump an unanswered decision that is blocking other people",
  domain: "executive-assistant",
  tags: ["executive-assistant", "followup", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant keeps bumping a scheduling or event decision until it is resolved.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  seed: [
    {
      type: "advanceClock",
      by: "48h",
    },
  ],
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Bump Unanswered Decision",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-bump-policy",
      room: "main",
      text: "If I still haven't answered about those three events, bump me again with context instead of starting over.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "LIFE"],
        description: "decision follow-up tracking",
        includesAny: ["bump", "context", "events", "follow"],
      }),
      responseIncludesAny: ["bump", "again", "context", "events", "follow up"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "LIFE"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["INBOX", "LIFE"],
      includesAny: ["bump", "context", "events"],
    },
    {
      type: "custom",
      name: "ea-bump-unanswered-decision-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "LIFE"],
        description: "decision follow-up tracking",
        includesAny: ["bump", "context", "events", "follow"],
      }),
    },
  ],
});
