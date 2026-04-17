import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.docs.collect-id-copy-for-workflow",
  title: "Collect a missing ID copy or artifact to unblock a workflow",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "identity", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant requests an updated ID copy because the one on file is expired.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Collect ID Copy",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-id-copy",
      room: "main",
      text: "If the only ID on file is expired, ask me for an updated copy so the workflow can continue.",
      responseIncludesAny: [
        "ID",
        "expired",
        "updated copy",
        "workflow",
        "continue",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-collect-id-copy-for-workflow-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: sensitive artifact collection for downstream workflows is not yet handled as a dedicated assistant flow.",
    },
  ],
});
