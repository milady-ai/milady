import { buildConnectorCertificationScenario } from "./_factory.ts";

export default buildConnectorCertificationScenario({
  id: "connector.twilio-voice.certify-core",
  title: "Certify Twilio voice approval and outcome tracking",
  connector: "twilio-voice",
  description:
    "Connector certification for approval-gated Twilio voice calls, outcome state, and escalation-ladder integration.",
  turns: [
    {
      name: "twilio-voice-propose",
      text: "Prepare the Twilio voice call but wait for my confirmation before dialing.",
      responseIncludesAny: ["call", "twilio", "confirm"],
      acceptedActions: ["CALL_USER", "CALL_EXTERNAL"],
      includesAny: ["call", "twilio", "confirm"],
    },
    {
      name: "twilio-voice-confirm",
      text: "Confirmed, place the call now.",
      responseIncludesAny: ["call", "placed", "dialing"],
      acceptedActions: ["CALL_USER", "CALL_EXTERNAL"],
      includesAny: ["call", "place", "dial"],
    },
  ],
  finalChecks: [
    { type: "approvalRequestExists", expected: true },
    { type: "pushSent", channel: "phone_call" },
  ],
});
