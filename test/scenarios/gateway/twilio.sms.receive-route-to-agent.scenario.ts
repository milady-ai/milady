import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twilio.sms.receive-route-to-agent",
  title: "Incoming Twilio SMS routes to the user's agent",
  domain: "gateway",
  tags: ["gateway", "twilio", "sms", "smoke", "not-yet-implemented"],
  description:
    "Inbound SMS hits the Twilio webhook and is routed to the user's agent as a message. Requires T9e (Twilio gateway inbound routing to user-agent).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "twilio",
      channelType: "DM",
      title: "Twilio SMS Receive",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "inbound-sms",
      room: "main",
      text: "Hey, this is a text from my phone. Did you get it?",
      responseIncludesAny: ["got", "received", "text", "SMS"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twilio-sms-receive-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9e (Twilio gateway: webhook receiver + routing to user-agent is not fully wired).",
    },
  ],
});
