/**
 * Verifies the end-to-end path: browser extension emits per-site
 * events → collector ingests → agent can query per-site data. This
 * scenario specifically tests the extension-as-data-source.
 *
 * NotYetImplemented until T8e (browser extension) is built.
 */

import { scenario } from "@elizaos/scenario-schema";

const ACTIVITY_ACTIONS = ["GET_TIME_ON_SITE", "GET_ACTIVITY_REPORT"];

export default scenario({
  id: "activity.browser-extension-feeds-data",
  title: "Browser extension feeds per-site activity data",
  domain: "activity",
  tags: ["activity", "browser", "happy-path"],
  description:
    "Tests the extension → collector → agent query path. NotYetImplemented until T8e.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Activity: extension pipeline",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "extension-feed-check",
      room: "main",
      text: "What's the latest per-site data the LifeOps extension has sent you?",
      responseIncludesAny: [/extension/i, /site/i, /data/i, /not.*install/i],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          ACTIVITY_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: extension → collector path missing — see task T8e.",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "extension-feed-present",
      predicate: async () => {
        return "NotYetImplemented: browser extension data feed requires T8e.";
      },
    },
  ],
});
