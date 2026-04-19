import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "todo.cross-device.create-and-query",
  title: "Create a todo on the dashboard, query it from mobile",
  domain: "todos",
  tags: ["lifeops", "todos", "smoke", "cross-platform-inconsistency"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      title: "LifeOps Todos Cross-Device Main",
    },
    {
      id: "mobile",
      source: "telegram",
      title: "LifeOps Todos Cross-Device Mobile",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-on-dashboard",
      room: "main",
      text: "Create a todo: pick up dry cleaning tomorrow.",
      expectedActions: ["LIFE"],
      responseIncludesAny: ["dry cleaning", "todo", "tomorrow"],
    },
    {
      kind: "message",
      name: "query-on-mobile",
      room: "mobile",
      text: "What's on my todo list?",
      responseIncludesAny: ["dry cleaning"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-device-intent-bus-ready",
      predicate: async () => {
        throw new Error(
          "NotYetImplemented: cross-device intent bus (T9g: Cross-device intent bus, plan §6.24)",
        );
      },
    },
  ],
});
