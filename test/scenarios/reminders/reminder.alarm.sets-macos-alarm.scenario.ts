import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "reminder.alarm.sets-macos-alarm",
  title: "Reminder requests a native macOS alarm via helper",
  domain: "reminders",
  tags: ["reminders", "lifeops", "not-yet-implemented", "plugin-disabled"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "discord",
      title: "Reminders macOS Alarm",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request macos alarm",
      text: "Set a Mac alarm for 9am tomorrow so I don't sleep through the standup.",
      responseIncludesAny: ["alarm", "9", "mac"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "macos-alarm-action-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8b (macOS native alarm helper plugin)",
    },
  ],
});
