import { buildConnectorCertificationScenario } from "./_factory.ts";

export default buildConnectorCertificationScenario({
  id: "connector.browser-portal.certify-core",
  title: "Certify browser and portal upload flows",
  connector: "browser-portal",
  description:
    "Connector certification for browser automation uploads, blocked-state intervention, and credential-scoped resume behavior.",
  turns: [
    {
      name: "browser-portal-core",
      text: "Upload the file through the portal, and if the browser gets blocked, ask me for help and resume after that.",
      responseIncludesAny: ["portal", "upload", "browser", "help"],
      acceptedActions: ["LIFEOPS_COMPUTER_USE", "REQUEST_FIELD_FILL"],
      includesAny: ["portal", "upload", "browser", "help"],
    },
  ],
  finalChecks: [
    { type: "browserTaskCompleted", expected: true },
    { type: "browserTaskNeedsHuman", expected: true },
    { type: "uploadedAssetExists", expected: true },
  ],
});
