import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "calendar.calendly.navigate",
  title: "Agent books an intro call via Calendly link",
  domain: "calendar",
  tags: ["lifeops", "calendar", "not-yet-implemented"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Calendar Calendly Navigate",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "book-calendly",
      text: "Book me an intro call on Alex's Calendly: https://calendly.com/alex/intro",
      responseIncludesAny: ["calendly", "intro", "book", "alex"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "calendly-navigate-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: waiting on T8h (Calendly plugin)",
    },
  ],
});
