/**
 * 1Password autofill on a whitelisted site (GitHub). The user asks
 * the agent to log them in; the agent should invoke the autofill
 * action through the browser extension, scoped to sites in the
 * autofill whitelist.
 *
 * NotYetImplemented until T8f (1Password autofill integration) lands.
 */

import { scenario } from "@elizaos/scenario-schema";

const AUTOFILL_ACTIONS = ["AUTOFILL_FIELD", "REQUEST_FIELD_FILL"];

export default scenario({
  id: "1password-autofill.whitelisted-site",
  title: "1Password autofill on whitelisted GitHub login",
  domain: "browser.lifeops",
  tags: ["browser", "autofill", "happy-path"],
  description:
    "User asks the agent to log into GitHub. Agent should autofill credentials via 1Password through the extension. NotYetImplemented until T8f.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
    credentials: ["1password:milady-e2e-autofill"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Autofill: whitelisted GitHub",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "github-login-request",
      room: "main",
      text: "Log me into GitHub.",
      responseIncludesAny: [
        /github/i,
        /login|log in|sign in/i,
        /autofill|fill/i,
      ],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          AUTOFILL_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no AUTOFILL_FIELD / REQUEST_FIELD_FILL fired — see task T8f (1Password autofill).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "autofill-action-registered",
      predicate: async () => {
        return "NotYetImplemented: 1Password whitelisted-site autofill requires T8f.";
      },
    },
  ],
});
