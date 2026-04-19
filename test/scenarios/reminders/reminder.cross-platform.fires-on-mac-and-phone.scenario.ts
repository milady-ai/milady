import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "reminder.cross-platform.fires-on-mac-and-phone",
  title: "Reminder fires on both Mac and phone via device bus",
  domain: "reminders",
  tags: ["reminders", "lifeops", "cross-platform", "not-yet-implemented"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "discord",
      title: "Reminders Cross-Platform Mac+Phone",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request multi-device reminder",
      text: "Remind me at 3pm to take my meds, and make sure it fires on both my Mac and my phone.",
      responseIncludesAny: ["3pm", "meds", "reminder", "phone", "mac"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "device-bus-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9g (cross-device intent bus)",
    },
  ],
});
