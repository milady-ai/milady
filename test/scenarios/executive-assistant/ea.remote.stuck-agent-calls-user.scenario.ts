import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.remote.stuck-agent-calls-user",
  title: "Call the user for help when the assistant gets stuck",
  domain: "executive-assistant",
  tags: ["executive-assistant", "remote", "escalation", "transcript-derived"],
  description:
    "Transcript-derived case: when browser or computer-use automation gets blocked, the assistant should escalate to the user instead of silently failing.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Remote Stuck Agent Calls User",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "remote-help-policy",
      room: "main",
      text: "If you get stuck in the browser or on my computer, call me and let me jump in to unblock it.",
      responseIncludesAny: ["call", "stuck", "browser", "computer", "unblock"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-remote-stuck-agent-calls-user-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: stuck-agent phone escalation plus remote-control handoff is not yet fully wired end-to-end.",
    },
  ],
});
