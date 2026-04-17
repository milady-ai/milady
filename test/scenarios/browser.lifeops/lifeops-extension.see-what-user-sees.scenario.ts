/**
 * Context-awareness through the browser extension: when the user is
 * on a specific page, the agent should be able to read page context
 * (URL, title, selected text) and answer questions about what is on
 * screen without a screenshot.
 *
 * NotYetImplemented until T8e ships the agent-context feed.
 */

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "lifeops-extension.see-what-user-sees",
  title: "Agent reads current page context from extension",
  domain: "browser.lifeops",
  tags: ["browser", "context", "happy-path"],
  description:
    "User is on a web page; asks the agent 'What am I looking at right now?'. The agent reads URL + title + selection from the extension. NotYetImplemented until T8e.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Browser extension: see what user sees",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "see-page-query",
      room: "main",
      text: "What am I looking at in my browser right now?",
      responseIncludesAny: [
        /page/i,
        /tab/i,
        /url/i,
        /extension/i,
        /not.*install/i,
      ],
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "page-context-available",
      predicate: async () => {
        return "NotYetImplemented: reading current-page context from the browser requires T8e (browser extension) agent-context feed.";
      },
    },
  ],
});
