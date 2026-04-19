import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twilio.sms.send-from-agent-with-confirmation",
  title: "Agent sends outbound SMS via Twilio after confirmation",
  domain: "gateway",
  tags: [
    "gateway",
    "twilio",
    "sms",
    "confirms-destructive-edge",
    "not-yet-implemented",
  ],
  description:
    "Agent proposes sending an SMS via Twilio, user confirms, then outbound message is delivered. Requires T9e (Twilio gateway outbound SMS action).",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twilio SMS Send With Confirmation",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "propose-send",
      room: "main",
      text: "Send my mom a text saying I'll be late for dinner.",
      responseIncludesAny: ["confirm", "send", "mom", "late"],
    },
    {
      kind: "message",
      name: "confirm-send",
      room: "main",
      text: "Yes, send it.",
      responseIncludesAny: ["sent", "delivered", "text"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twilio-sms-send-confirm-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9e (Twilio gateway outbound SMS action + confirmation UX).",
    },
  ],
});
