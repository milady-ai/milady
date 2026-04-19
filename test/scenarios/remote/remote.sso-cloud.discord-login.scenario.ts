import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.sso-cloud.discord-login",
  title: "User authenticates via Discord SSO to access remote session",
  domain: "remote",
  tags: ["remote", "sso", "credentials-missing-edge", "not-yet-implemented"],
  description:
    "User authenticates to the remote-access surface via Discord SSO through Eliza Cloud. Requires T9a (remote-control data plane auth integration).",
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
      title: "Remote SSO Discord Login",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "discord-sso",
      room: "main",
      text: "Let me log into remote access with my Discord account.",
      responseIncludesAny: ["Discord", "sign in", "SSO", "login", "auth"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-sso-discord-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane Discord SSO integration via Eliza Cloud).",
    },
  ],
});
