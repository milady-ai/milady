import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "reminder.cross-platform.created-on-phone-fires-on-mac",
  title: "Reminder created on phone fires on Mac via device bus",
  domain: "reminders",
  tags: ["reminders", "lifeops", "cross-platform", "not-yet-implemented"],
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "phone",
      source: "telegram",
      title: "Reminders Cross-Platform Phone Origin",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create from phone",
      room: "phone",
      text: "Remind me in 2 hours to refill the prescription — I'll be at my Mac by then.",
      responseIncludesAny: ["2 hour", "remind", "prescription", "mac"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "device-bus-phone-to-mac-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9g (cross-device intent bus)",
    },
  ],
});
