import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.agent-calls-for-help",
  title: "Agent escalates to user via phone call when stuck",
  domain: "remote",
  tags: [
    "remote",
    "escalation",
    "retry-after-failure-edge",
    "not-yet-implemented",
  ],
  description:
    "Agent hits a blocking condition and escalates by triggering an outbound call/push to the user. Requires T9a (remote-control data plane) plus T9e (Twilio calling gateway).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Remote Agent Calls For Help",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "agent-stuck",
      room: "main",
      text: "You're authorized to call me if you run into something you can't handle.",
      responseIncludesAny: ["call", "phone", "escalate", "reach you"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-agent-calls-for-help-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (escalation trigger from stuck agent) + T9e (Twilio outbound calling gateway).",
    },
  ],
});
