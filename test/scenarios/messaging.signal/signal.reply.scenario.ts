import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "signal.reply",
  title: "Reply to Signal message with confirmation",
  domain: "messaging.signal",
  tags: ["messaging", "signal", "confirmation"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Signal Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft signal reply",
      room: "main",
      text: "Reply on Signal to Dana saying I confirmed the booking.",
      forbiddenActions: ["SIGNAL_SEND_MESSAGE"],
      responseIncludesAny: ["signal", "dana", "draft"],
    },
    {
      kind: "message",
      name: "confirm send",
      room: "main",
      text: "Send it.",
      responseIncludesAny: ["sent", "sending", "send"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "signal-reply-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T5f (plugin-signal integration in new schema surface)",
    },
  ],
});
