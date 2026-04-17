import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.triage-priority-ranking",
  title: "Rank incoming messages across all channels by priority",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "triage", "parameter-extraction"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Cross-Platform Triage Priority",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "priority triage",
      room: "main",
      text: "Rank the most important incoming messages across every platform right now.",
      responseIncludesAny: ["priority", "rank", "important"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-triage-priority-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7d (message triage v2 cross-platform priority ranking)",
    },
  ],
});
