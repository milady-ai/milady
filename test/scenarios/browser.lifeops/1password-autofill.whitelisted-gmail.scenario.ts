/**
 * 1Password autofill on Gmail login (also whitelisted by default).
 * User asks the agent to log them in; agent invokes autofill via the
 * browser extension.
 *
 * NotYetImplemented until T8f.
 */

import { scenario } from "@elizaos/scenario-schema";

const AUTOFILL_ACTIONS = ["AUTOFILL_FIELD", "REQUEST_FIELD_FILL"];

export default scenario({
  id: "1password-autofill.whitelisted-gmail",
  title: "1Password autofill on whitelisted Gmail login",
  domain: "browser.lifeops",
  tags: ["browser", "autofill", "happy-path"],
  description:
    "User asks the agent to log into Gmail. Agent should autofill via 1Password through the extension. NotYetImplemented until T8f.",

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
      title: "Autofill: whitelisted Gmail",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "gmail-login-request",
      room: "main",
      text: "Log me into Gmail.",
      responseIncludesAny: [
        /gmail/i,
        /login|log in|sign in/i,
        /autofill|fill/i,
      ],
      assertTurn: (turn) => {
        const hit = turn.actionsCalled.find((a) =>
          AUTOFILL_ACTIONS.includes(a.actionName),
        );
        if (!hit) {
          throw new Error(
            "NotYetImplemented: no autofill action fired — see task T8f (1Password autofill).",
          );
        }
      },
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "autofill-gmail-feasible",
      predicate: async () => {
        return "NotYetImplemented: Gmail autofill requires T8f (1Password autofill integration).";
      },
    },
  ],
});
