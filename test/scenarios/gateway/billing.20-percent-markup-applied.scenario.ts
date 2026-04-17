import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "billing.20-percent-markup-applied",
  title: "Gateway SMS usage is billed with 20% markup",
  domain: "gateway",
  tags: [
    "gateway",
    "billing",
    "credentials-missing-edge",
    "not-yet-implemented",
  ],
  description:
    "Agent sends an SMS through the Twilio gateway and the resulting usage charge is recorded with the 20% Eliza Cloud markup. Requires T9d (billing markup) and T9e (Twilio gateway outbound).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Billing 20 Percent Markup",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "send-sms-for-billing",
      room: "main",
      text: "Send a quick SMS to my coworker letting them know I'm on my way.",
      responseIncludesAny: ["SMS", "send", "coworker", "confirm"],
    },
    {
      kind: "message",
      name: "confirm-send",
      room: "main",
      text: "Yes, send it.",
      responseIncludesAny: ["sent", "delivered"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "billing-markup-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9d (Eliza Cloud billing markup recording) + T9e (Twilio outbound SMS action).",
    },
  ],
});
