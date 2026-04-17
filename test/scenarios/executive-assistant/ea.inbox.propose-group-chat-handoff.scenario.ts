import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.propose-group-chat-handoff",
  title: "Propose a group-chat handoff when direct coordination is messy",
  domain: "executive-assistant",
  tags: ["executive-assistant", "messaging", "handoff", "transcript-derived"],
  description:
    "Transcript-derived case: sometimes the assistant should suggest linking people into a group chat instead of continuing one-off relays.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Group Chat Handoff",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "propose-group-handoff",
      room: "main",
      text: "If direct relaying gets messy here, suggest making a group chat handoff instead.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "CROSS_CHANNEL_SEND"],
        description: "group chat handoff planning",
        includesAny: ["group", "chat", "handoff", "relay"],
      }),
      responseIncludesAny: [
        "group chat",
        "handoff",
        "relay",
        "suggest",
        "coordination",
      ],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "CROSS_CHANNEL_SEND"],
    },
    {
      type: "custom",
      name: "ea-propose-group-chat-handoff-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "CROSS_CHANNEL_SEND"],
        description: "group chat handoff planning",
        includesAny: ["group", "chat", "handoff", "relay"],
      }),
    },
  ],
});
