import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.daily-brief-includes-unsent-drafts",
  title: "Daily brief includes unsent drafts still waiting for approval",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "drafts", "transcript-derived"],
  description:
    "Transcript-derived case: unsent drafts that still need sign-off appear in the assistant's daily brief.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Includes Unsent Drafts",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief-with-drafts",
      room: "main",
      text: "In the daily brief, also tell me which drafts still need my sign-off.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "daily brief approval queue review",
        includesAny: ["draft", "sign-off", "approval", "brief"],
      }),
      responseIncludesAny: ["draft", "sign-off", "approval", "brief", "unsent"],
    },
  ],
  finalChecks: [
    {
      type: "approvalRequestExists",
      expected: true,
    },
    {
      type: "draftExists",
      expected: true,
    },
    {
      type: "custom",
      name: "ea-daily-brief-includes-unsent-drafts-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "daily brief approval queue review",
        includesAny: ["draft", "sign-off", "approval", "brief"],
      }),
    },
  ],
});
