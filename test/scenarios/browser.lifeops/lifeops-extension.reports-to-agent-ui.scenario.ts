/**
 * The LifeOps browser extension must push activity telemetry to the
 * agent UI surface so the user can see a live panel of time-on-site,
 * current URL, etc. This scenario exercises the extension → API → UI
 * path by asking the agent what the extension is currently reporting.
 *
 * NotYetImplemented until T8e (browser extension) lands.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "lifeops-extension.reports-to-agent-ui",
  title: "Extension pushes telemetry to agent UI",
  domain: "browser.lifeops",
  tags: ["browser", "activity", "happy-path"],
  description:
    "Tests the extension → agent UI surface. User asks the agent to confirm the extension is connected and reporting. NotYetImplemented until T8e.",

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
      title: "Browser extension: UI reporting",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "extension-status-query",
      room: "main",
      text: "Is the LifeOps browser extension connected and sending data to the agent UI right now?",
      responseIncludesAny: [
        /extension/i,
        /connected/i,
        /reporting/i,
        /not.*install/i,
      ],
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "extension-reports-to-ui",
      predicate: async () => {
        return "NotYetImplemented: LifeOps browser extension → agent UI telemetry path requires T8e (browser extension) to be built.";
      },
    },
  ],
});
