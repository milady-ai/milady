import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.block-apps.mobile",
  title: "Block distracting apps on the user's phone",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "cross-device"],
  description:
    "User asks the agent to block social apps on their iOS/Android device. Requires a companion app that enforces Screen Time / Digital Wellbeing intents (T8c).",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "SelfControl Mobile App Block",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-mobile-app-block",
      room: "main",
      text: "Block Instagram and TikTok on my phone for the next 3 hours.",
      responseIncludesAny: ["phone", "instagram", "tiktok", "block"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "mobile-app-block-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8c (iOS companion app with Screen Time app-block intents).",
    },
  ],
});
