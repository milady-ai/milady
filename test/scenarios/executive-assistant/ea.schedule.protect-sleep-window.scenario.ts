import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "ea.schedule.protect-sleep-window",
  title: "Protect sleep window unless the user explicitly overrides it",
  domain: "executive-assistant",
  tags: [
    "executive-assistant",
    "calendar",
    "preferences",
    "transcript-derived",
  ],
  description:
    "Transcript-derived case: the assistant checks whether a meeting is allowed inside a protected sleep block.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Sleep Window Protection",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "sleep-window-preference",
      room: "main",
      text: "No calls between 11pm and 8am unless I explicitly say it's okay.",
      responseIncludesAny: ["11pm", "8am", "sleep", "protect", "explicitly"],
    },
    {
      kind: "message",
      name: "request-early-call",
      room: "main",
      text: "Can you schedule a 7am call tomorrow, or should we move it?",
      responseIncludesAny: ["7am", "sleep", "okay", "move", "override"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "ea-protect-sleep-window-not-yet-implemented",
      predicate: async () =>
        "NotYetImplemented: sleep-window enforcement plus override handling is not yet wired into executive-assistant scheduling preferences.",
    },
  ],
});
