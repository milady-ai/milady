import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.pair.remote-requires-code",
  title: "Remote pairing requires a one-time code",
  domain: "remote",
  tags: ["remote", "pairing", "permission-denied-edge", "not-yet-implemented"],
  description:
    "When the companion client connects from outside the LAN, the agent must refuse pairing without a one-time code. Needs T9a remote-control data plane with pairing code issuance/verification.",
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
      title: "Remote Pair Requires Code",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "pair-remote",
      room: "main",
      text: "I want to pair a new device from my phone across the internet.",
      responseIncludesAny: ["code", "pairing code", "one-time", "verify"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-pair-requires-code-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane: pairing-code issuance and verification on non-local connections).",
    },
  ],
});
