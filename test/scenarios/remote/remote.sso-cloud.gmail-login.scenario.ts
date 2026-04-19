import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.sso-cloud.gmail-login",
  title: "User authenticates via Gmail SSO to access remote session",
  domain: "remote",
  tags: ["remote", "sso", "credentials-missing-edge", "not-yet-implemented"],
  description:
    "User authenticates to the remote-access surface via Google/Gmail SSO through Eliza Cloud. Requires T9a (remote-control data plane auth integration).",
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
      title: "Remote SSO Gmail Login",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "gmail-sso",
      room: "main",
      text: "Let me log into remote access with my Google account.",
      responseIncludesAny: ["Google", "Gmail", "sign in", "SSO", "login"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-sso-gmail-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane Google/Gmail SSO integration via Eliza Cloud).",
    },
  ],
});
