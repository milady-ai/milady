import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "todo.cross-device.global-alarm",
  title: "Setting an alarm fires on both Mac and iOS",
  domain: "todos",
  tags: ["lifeops", "todos", "cross-platform-inconsistency"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      title: "LifeOps Todos Cross-Device Global Alarm",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "set-global-alarm",
      text: "Set an alarm for 7am tomorrow to wake up.",
      responseIncludesAny: ["alarm", "7", "wake up", "tomorrow"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "global-alarm-ready",
      predicate: async () => {
        throw new Error(
          "NotYetImplemented: global alarm across Mac + iOS (T8b: macOS native alarm, plan §6.10; T8c: iOS native alarm + companion skeleton, plan §6.11)",
        );
      },
    },
  ],
});
