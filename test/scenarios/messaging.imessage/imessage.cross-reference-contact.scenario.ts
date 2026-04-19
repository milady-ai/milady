import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "imessage.cross-reference-contact",
  title: "Cross-reference an unknown iMessage sender phone number",
  domain: "messaging.imessage",
  tags: ["messaging", "imessage", "missing-context"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
    os: "macos",
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "iMessage Cross-Reference Contact",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "cross reference",
      room: "main",
      text: "Who is +14155551234?",
      responseIncludesAny: ["415", "contact", "number"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "imessage-cross-ref-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5e (BlueBubbles iMessage integration wiring)",
    },
  ],
});
