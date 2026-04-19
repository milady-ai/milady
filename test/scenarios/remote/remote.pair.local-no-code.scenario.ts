import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.pair.local-no-code",
  title: "Local pairing requires no code",
  domain: "remote",
  tags: ["remote", "pairing", "smoke", "not-yet-implemented"],
  description:
    "When the companion client connects from the same machine/LAN as the agent, no pairing code is required. Exercising this end-to-end needs the remote-control data plane (T9a).",
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
      title: "Remote Pair Local No Code",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "pair-locally",
      room: "main",
      text: "Pair my companion client. I'm on the same machine.",
      responseIncludesAny: ["pair", "local", "connected", "no code"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-pair-local-no-code-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9a (remote-control data plane: pairing, session brokerage, input event channel).",
    },
  ],
});
