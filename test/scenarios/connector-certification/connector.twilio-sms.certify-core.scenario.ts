import { buildConnectorCertificationScenario } from "./_factory.ts";

export default buildConnectorCertificationScenario({
  id: "connector.twilio-sms.certify-core",
  title: "Certify Twilio SMS send-after-approval",
  connector: "twilio-sms",
  description:
    "Connector certification for approval-gated Twilio SMS sends, delivery state, and retry-safe dispatch behavior.",
  turns: [
    {
      name: "twilio-sms-propose",
      text: "Draft an SMS through Twilio and only send it after I explicitly confirm.",
      responseIncludesAny: ["sms", "twilio", "confirm", "draft"],
      acceptedActions: ["CROSS_CHANNEL_SEND"],
      includesAny: ["sms", "confirm", "draft", "twilio"],
    },
    {
      name: "twilio-sms-confirm",
      text: "Confirmed, send the Twilio SMS now.",
      responseIncludesAny: ["sms", "sent", "twilio"],
      acceptedActions: ["CROSS_CHANNEL_SEND"],
      includesAny: ["sms", "send", "twilio"],
    },
  ],
  finalChecks: [
    { type: "approvalRequestExists", expected: true },
    { type: "messageDelivered", channel: "sms", expected: true },
  ],
});
