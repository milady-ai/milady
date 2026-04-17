import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.integration-with-todos.auto-block",
  title: "Auto-block social sites when a todo is still open at noon",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "multi-turn"],
  description:
    "Requires the todo-integrated website blocker that observes todo completion state and auto-blocks when a gating todo is still open past a deadline. Blocked on T7g.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "SelfControl Auto-Block From Todos",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "set-rule",
      room: "main",
      text: "Auto-block socials if my workout isn't done by noon.",
      responseIncludesAny: ["workout", "block", "noon", "social"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "auto-block-from-todos-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7g (website-blocker chat integration reading todo completion state).",
    },
  ],
});
