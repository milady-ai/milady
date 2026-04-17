import { buildConnectorCertificationScenario } from "./_factory.ts";

export default buildConnectorCertificationScenario({
  id: "connector.gmail.certify-core",
  title: "Certify Gmail read, draft, and send-after-approval",
  connector: "gmail",
  description:
    "Connector certification for Gmail inbox reads, draft creation, explicit approval before send, and degraded-auth handling.",
  turns: [
    {
      name: "gmail-triage",
      text: "Check my unread Gmail, draft a reply if needed, and only send after I approve it.",
      responseIncludesAny: ["gmail", "draft", "approve", "unread"],
      acceptedActions: ["GMAIL_ACTION", "INBOX"],
      includesAny: ["gmail", "draft", "approve", "unread"],
    },
  ],
  finalChecks: [
    { type: "draftExists", channel: "gmail", expected: true },
    { type: "approvalRequestExists", expected: true },
    { type: "messageDelivered", channel: "gmail", expected: true },
    { type: "interventionRequestExists", expected: true },
  ],
});
