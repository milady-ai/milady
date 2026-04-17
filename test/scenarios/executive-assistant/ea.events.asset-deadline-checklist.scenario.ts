import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.events.asset-deadline-checklist",
  title: "Track speaker assets and event deadlines",
  domain: "executive-assistant",
  tags: ["executive-assistant", "events", "docs", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant keeps tabs on slides, titles, bios, and other event assets due before talks.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Event Asset Checklist",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-event-assets",
      room: "main",
      text: "Tell me what slides, bio, title, or portal assets I still owe before the event.",
      responseIncludesAny: ["slides", "bio", "title", "portal", "owe"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-asset-deadline-checklist-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: event-asset deadline tracking and briefing are not yet wired into the assistant planning loop.",
    },
  ],
});
