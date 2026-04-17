import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "reminder.cross-platform.acknowledged-syncs",
  title: "Acknowledging a reminder on one device stops it on the other",
  domain: "reminders",
  tags: ["reminders", "lifeops", "cross-platform", "not-yet-implemented"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "mac",
      source: "discord",
      title: "Reminders Cross-Platform Ack Sync Mac",
    },
    {
      id: "phone",
      source: "telegram",
      title: "Reminders Cross-Platform Ack Sync Phone",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "ack on mac",
      room: "mac",
      text: "got it, I took the meds — clear that reminder on my phone too",
      responseIncludesAny: ["took", "cleared", "thanks", "okay", "got it"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "device-bus-ack-sync-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9g (cross-device intent bus)",
    },
  ],
});
