import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.same-person-multi-platform",
  title: "Recognize same person across Gmail, Discord, and Telegram handles",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "messaging", "parameter-extraction"],
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
      title: "Cross-Platform Same Person",
    },
  ],
  seed: [
    {
      type: "contact",
      name: "Alice Example",
      handles: [
        { platform: "gmail", identifier: "alice@example.com" },
        { platform: "discord", identifier: "alice#1234" },
        { platform: "telegram", identifier: "@alice_tg" },
      ],
      notes: "Collaborator across three platforms; recognize as one person.",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "ask about alice",
      room: "main",
      text: "Show me everywhere Alice has messaged me recently.",
      responseIncludesAny: ["alice", "gmail", "discord", "telegram"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-same-person-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T7b (Rolodex extension for cross-platform contact merging)",
    },
  ],
});
