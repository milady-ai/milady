import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.remote.stuck-agent-calls-user",
  title: "Call the user for help when the assistant gets stuck",
  domain: "executive-assistant",
  tags: ["executive-assistant", "remote", "escalation", "transcript-derived"],
  description:
    "Transcript-derived case: when browser or computer-use automation gets blocked, the assistant should escalate to the user instead of silently failing.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Remote Stuck Agent Calls User",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "remote-help-policy",
      room: "main",
      text: "If you get stuck in the browser or on my computer, call me and let me jump in to unblock it.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["CALL_USER", "LIFEOPS_COMPUTER_USE"],
        description: "stuck-agent escalation",
        includesAny: ["call", "stuck", "browser", "computer", "unblock"],
      }),
      responseIncludesAny: ["call", "stuck", "browser", "computer", "unblock"],
    },
  ],
  finalChecks: [
    {
      type: "interventionRequestExists",
      expected: true,
    },
    {
      type: "pushSent",
      channel: "phone_call",
    },
    {
      type: "custom",
      name: "ea-remote-stuck-agent-calls-user-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["CALL_USER", "LIFEOPS_COMPUTER_USE"],
        description: "stuck-agent escalation",
        includesAny: ["call", "stuck", "browser", "computer", "unblock"],
      }),
    },
  ],
});
