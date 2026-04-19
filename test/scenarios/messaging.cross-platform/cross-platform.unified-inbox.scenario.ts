import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.unified-inbox",
  title: "Unified inbox across all messaging platforms",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "messaging", "happy-path", "smoke"],
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
      title: "Cross-Platform Unified Inbox",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "unified inbox request",
      room: "main",
      text: "Show me everything unread across all my messaging",
      responseIncludesAny: ["unread", "inbox", "across"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-unified-inbox-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7d (message triage v2 cross-platform unified inbox)",
    },
  ],
});
