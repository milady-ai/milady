import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.nighttime-wind-down",
  title: "Block distracting apps after 10pm each night",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "time-of-day-edge"],
  description:
    "User schedules a nightly block that starts at 10pm. Exercising this path end-to-end requires the check-in / schedule engine (T9f) plus a scheduler that fires the block action at the configured time.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "SelfControl Nighttime Wind Down",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "schedule-nightly-block",
      room: "main",
      text: "Block apps after 10pm every night until I go to sleep.",
      responseIncludesAny: ["10", "night", "block", "sleep"],
    },
    {
      kind: "wait",
      name: "let-scheduler-fire",
      durationMs: 500,
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "nighttime-wind-down-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T9f (morning/night check-in + scheduling engine that dispatches scheduled blocks).",
    },
  ],
});
