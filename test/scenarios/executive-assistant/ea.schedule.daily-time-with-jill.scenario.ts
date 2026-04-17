import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.schedule.daily-time-with-jill",
  title: "Reserve recurring daily time with Jill",
  domain: "executive-assistant",
  tags: [
    "executive-assistant",
    "calendar",
    "relationships",
    "transcript-derived",
  ],
  description:
    "Transcript-derived case: create a recurring daily decompression block with Jill before bed.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Schedule Daily Time With Jill",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create-jill-time-block",
      room: "main",
      text: "Need to book 1 hour per day for time with Jill. Any time is fine, ideally before sleep.",
      responseIncludesAny: ["Jill", "hour", "daily", "before bed", "schedule"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-daily-jill-time-block-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: recurring relationship-aware decompression blocks are not yet wired as a first-class executive-assistant scheduling flow.",
    },
  ],
});
