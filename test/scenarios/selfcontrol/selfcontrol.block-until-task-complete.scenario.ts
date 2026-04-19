import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.block-until-task-complete",
  title: "Block X.com until the workout todo is marked complete",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "multi-turn"],
  description:
    "User asks the agent to block a site until a todo completes. Requires the website-blocker chat integration that reconciles block lifecycle with todo completion (T7g).",
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
      title: "SelfControl Block Until Complete",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-conditional-block",
      room: "main",
      text: "Block X.com until I finish my workout.",
      responseIncludesAny: ["workout", "block", "x"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "block-until-task-complete-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7g (website-blocker chat integration with todo completion reconciler).",
    },
  ],
});
