import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.vnc.revoke-session",
  title: "Revoke an active remote VNC session",
  domain: "remote",
  tags: ["remote", "vnc", "cancel-mid-flow-edge", "not-yet-implemented"],
  description:
    "Agent terminates an active remote-help session when the user asks. Requires T9a remote-control data plane (session lifecycle, connection teardown).",
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
      title: "Remote VNC Revoke Session",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "revoke-vnc",
      room: "main",
      text: "End the remote session now.",
      responseIncludesAny: [
        "end",
        "revoke",
        "closed",
        "disconnected",
        "terminated",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-vnc-revoke-session-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane: session teardown + connection revocation).",
    },
  ],
});
