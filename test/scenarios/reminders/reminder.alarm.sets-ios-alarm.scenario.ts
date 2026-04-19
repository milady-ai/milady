import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "reminder.alarm.sets-ios-alarm",
  title: "Reminder requests a real iOS alarm on paired device",
  domain: "reminders",
  tags: ["reminders", "lifeops", "not-yet-implemented", "credentials-missing"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "discord",
      title: "Reminders iOS Alarm",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request ios alarm",
      text: "Set an iOS alarm on my phone for 6:30am tomorrow to catch the flight.",
      responseIncludesAny: ["alarm", "6:30", "phone"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ios-alarm-action-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8c (iOS companion alarm plugin)",
    },
  ],
});
