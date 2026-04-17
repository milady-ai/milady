import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twilio.call.receive",
  title: "Inbound Twilio call routes to the agent",
  domain: "gateway",
  tags: ["gateway", "twilio", "call", "smoke", "not-yet-implemented"],
  description:
    "Inbound phone call hits the Twilio voice webhook and is handled by the user's agent (transcription + response). Requires T9e (Twilio calling gateway).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "twilio",
      channelType: "DM",
      title: "Twilio Call Receive",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "inbound-call",
      room: "main",
      text: "[call transcript] Hi agent, this is a voice call coming in from my phone.",
      responseIncludesAny: ["call", "voice", "received", "hello"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twilio-call-receive-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9e (Twilio calling gateway: voice webhook + transcription + agent routing).",
    },
  ],
});
