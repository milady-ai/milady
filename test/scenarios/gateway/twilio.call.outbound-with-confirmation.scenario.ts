import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twilio.call.outbound-with-confirmation",
  title: "Agent places outbound Twilio call after confirmation",
  domain: "gateway",
  tags: [
    "gateway",
    "twilio",
    "call",
    "confirms-destructive-edge",
    "not-yet-implemented",
  ],
  description:
    "Agent proposes placing a phone call via Twilio, user confirms, then the call is initiated. Requires T9e (Twilio calling gateway outbound + confirmation UX).",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twilio Call Outbound With Confirmation",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "propose-call",
      room: "main",
      text: "Call my dentist and reschedule my appointment to next Tuesday.",
      responseIncludesAny: ["confirm", "call", "dentist", "Tuesday"],
    },
    {
      kind: "message",
      name: "confirm-call",
      room: "main",
      text: "Yes, place the call.",
      responseIncludesAny: ["calling", "dialing", "placed"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twilio-call-outbound-confirm-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9e (Twilio calling gateway outbound call action + confirmation UX).",
    },
  ],
});
