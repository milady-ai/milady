import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "selfcontrol.block-apps.ios-capacitor",
  title: "Block iOS apps via the Capacitor companion shell",
  domain: "selfcontrol",
  tags: ["lifeops", "selfcontrol", "not-yet-implemented", "ios"],
  description:
    "Specific iOS variant: the Capacitor companion must accept a BLOCK_APPS intent and wire into the FamilyControls / ManagedSettings framework. Blocked on T8c.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "SelfControl iOS Capacitor App Block",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-ios-app-block",
      room: "main",
      text: "Use my iPhone companion to block Instagram and TikTok until 6pm tonight.",
      responseIncludesAny: [
        "iphone",
        "companion",
        "instagram",
        "tiktok",
        "block",
      ],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ios-capacitor-app-block-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8c (iOS Capacitor companion with FamilyControls / ManagedSettings app-blocking bridge).",
    },
  ],
});
