import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "remote.mobile-controls-mac",
  title: "iOS companion sends input events to Mac",
  domain: "remote",
  tags: [
    "remote",
    "mobile",
    "cross-platform-inconsistency-edge",
    "not-yet-implemented",
  ],
  description:
    "iOS companion app sends click/keystroke events to the paired Mac agent. Requires T9c iOS remote companion UX plus T9a data plane for input event delivery.",
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
      title: "Remote Mobile Controls Mac",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mobile-input",
      room: "main",
      text: "I'm using my iPhone to click the submit button on my Mac right now.",
      responseIncludesAny: ["iPhone", "iOS", "input", "click", "remote"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "remote-mobile-controls-mac-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9c (iOS remote companion full UX) + T9a (input event channel from companion to host).",
    },
  ],
});
