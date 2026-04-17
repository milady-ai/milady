import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "signal.read-recent",
  title: "Read recent Signal messages",
  domain: "messaging.signal",
  tags: ["messaging", "signal", "happy-path", "smoke"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Signal Read Recent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "read signal",
      room: "main",
      text: "Check my Signal messages",
      responseIncludesAny: ["signal", "message", "recent"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "signal-read-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5f (plugin-signal integration in new schema surface)",
    },
  ],
});
